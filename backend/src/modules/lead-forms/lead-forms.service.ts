// src/modules/lead-forms/lead-forms.service.ts
// LOGIQUE MÉTIER : CRUD formulaires de collecte de leads + soumission publique (non signée) + ingestion webhook (HMAC obligatoire).
// docs/90 §webhook : AUCUNE écriture en base sans vérification de la signature (chemin webhook).
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { LeadChannel, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { verifySignature } from '../integrations/util/webhook-signature.util';
import { LeadsService } from '../leads/leads.service';
import { LeadFormsRepository } from './lead-forms.repository';
import {
  CreateLeadFormDto,
  IntakePayloadDto,
  QueryLeadFormDto,
  UpdateLeadFormDto,
} from './dto/lead-form.dto';

// Champs de lead connus (le reste est écrit dans meta).
const KNOWN_KEYS = new Set([
  'firstName',
  'lastName',
  'name',
  'email',
  'phone',
  'companyName',
  'source',
]);

// Définition des champs de formulaire (JSON). Paramètres ajoutés en v4.7.
interface FormField {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  errorMessage?: string;
  defaultCountry?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/; // téléphone international (E.164)

@Injectable()
export class LeadFormsService {
  private readonly logger = new Logger(LeadFormsService.name);

  constructor(
    private readonly repo: LeadFormsRepository,
    private readonly leads: LeadsService,
  ) {}

  // ---- Admin CRUD ----

  async create(dto: CreateLeadFormDto, _actor: AuthenticatedUser) {
    const form = await this.repo.create({
      name: dto.name,
      publicKey: this.genKey('pk'),
      secret: this.genKey('whsec'),
      fields: (dto.fields ??
        this.defaultFields()) as unknown as Prisma.InputJsonValue,
      buttonColor: dto.buttonColor ?? '#4f46e5',
      buttonLabel: dto.buttonLabel ?? 'Gönder',
      successMessage: dto.successMessage,
      redirectUrl: this.normalizeUrl(dto.redirectUrl),
    });
    // À la création, le secret est retourné une fois (pour l'installation).
    return this.toAdmin(form, true);
  }

  async findAll(q: QueryLeadFormDto) {
    const where: Prisma.LeadFormWhereInput = {};
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return {
      data: items.map((f) => this.toAdmin(f, false)),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string) {
    const form = await this.repo.findById(id);
    if (!form) throw new NotFoundException('Formulaire introuvable');
    return this.toAdmin(form, false);
  }

  // Le secret n'est retourné que sur demande explicite avec la permission MANAGE.
  async revealSecret(id: string) {
    const form = await this.repo.findById(id);
    if (!form) throw new NotFoundException('Formulaire introuvable');
    return { id: form.id, publicKey: form.publicKey, secret: form.secret };
  }

  async update(id: string, dto: UpdateLeadFormDto) {
    await this.findOne(id);
    const data: Prisma.LeadFormUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.fields !== undefined)
      data.fields = dto.fields as unknown as Prisma.InputJsonValue;
    if (dto.buttonColor !== undefined) data.buttonColor = dto.buttonColor;
    if (dto.buttonLabel !== undefined) data.buttonLabel = dto.buttonLabel;
    if (dto.successMessage !== undefined)
      data.successMessage = dto.successMessage;
    if (dto.redirectUrl !== undefined)
      data.redirectUrl = this.normalizeUrl(dto.redirectUrl);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const form = await this.repo.update(id, data);
    return this.toAdmin(form, false);
  }

  async rotateSecret(id: string) {
    await this.findOne(id);
    const form = await this.repo.update(id, { secret: this.genKey('whsec') });
    return { id: form.id, secret: form.secret };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { deleted: true };
  }

  // ---- Public: embed render config (secret YOK) ----

  async getPublicConfig(publicKey: string) {
    const form = await this.repo.findByPublicKey(publicKey);
    if (!form) throw new NotFoundException('Formulaire introuvable');
    if (!form.isActive) throw new GoneException('Formulaire inactif');
    return {
      name: form.name,
      fields: form.fields,
      buttonColor: form.buttonColor,
      buttonLabel: form.buttonLabel,
      successMessage: form.successMessage,
    };
  }

  // ---- Public : soumission de formulaire (non signée ; navigateur) → canal FORM ----

  async submit(publicKey: string, payload: IntakePayloadDto) {
    const form = await this.repo.findByPublicKey(publicKey);
    if (!form) throw new NotFoundException('Formulaire introuvable');
    if (!form.isActive) throw new GoneException('Formulaire inactif');

    // Validation des champs côté serveur (le contrôle client est contournable → sécurisé par défaut).
    this.validateSubmission(form.fields as unknown as FormField[], payload);

    const lead = await this.ingest(payload, LeadChannel.FORM, form);
    return {
      success: true,
      message: form.successMessage ?? null,
      redirectUrl: form.redirectUrl ?? null,
      leadId: lead.id,
    };
  }

  // ---- Public : ingestion webhook (HMAC obligatoire ; serveur à serveur) → canal WEBHOOK ----

  async ingestWebhook(params: {
    publicKey: string;
    rawBody: string;
    timestamp?: string;
    signature?: string;
  }) {
    const form = await this.repo.findByPublicKey(params.publicKey);
    if (!form) throw new NotFoundException('Formulaire introuvable');

    // RÈGLE : sans signature vérifiée, aucun parse/DB.
    const ts = Number(params.timestamp);
    if (!params.signature || !params.timestamp || Number.isNaN(ts)) {
      throw new UnauthorizedException('En-tête signature/timestamp manquant');
    }
    const ok = verifySignature({
      secret: form.secret,
      timestamp: ts,
      body: params.rawBody,
      signature: params.signature,
      nowSec: Math.floor(Date.now() / 1000),
    });
    if (!ok) throw new UnauthorizedException('Signature invalide');

    let payload: IntakePayloadDto;
    try {
      payload = JSON.parse(params.rawBody) as IntakePayloadDto;
    } catch {
      throw new ForbiddenException("Le corps n'est pas du JSON");
    }
    const lead = await this.ingest(payload, LeadChannel.WEBHOOK, form);
    return { success: true, leadId: lead.id };
  }

  // Valide le corps selon la configuration des champs. Premier échec → 400 avec message spécifique.
  // La validation client n'est pas la limite de sécurité ; le vrai contrôle est ici.
  private validateSubmission(
    fields: FormField[],
    payload: Record<string, unknown>,
  ): void {
    if (!Array.isArray(fields)) return;
    for (const f of fields) {
      if (!f || typeof f.key !== 'string') continue;
      const label = f.label || f.key;
      const raw = payload[f.key];
      const value = raw == null ? '' : String(raw).trim();
      const fail = (fallback: string): never => {
        throw new BadRequestException(f.errorMessage || fallback);
      };

      if (value === '') {
        if (f.required) fail(`${label} zorunludur.`);
        continue; // vide + optionnel → ignorer les autres contrôles
      }

      const type = f.type ?? 'text';
      if (type === 'email' && !EMAIL_RE.test(value)) {
        fail(`${label} doit être un e-mail valide.`);
      }
      if (type === 'phone' && !E164_RE.test(value)) {
        fail(`${label} doit être un téléphone international valide (+90…).`);
      }
      if (type === 'number') {
        const n = Number(value);
        if (!Number.isFinite(n)) fail(`${label} doit être un nombre.`);
        if (f.min != null && n < f.min) fail(`${label} doit être ≥ ${f.min}.`);
        if (f.max != null && n > f.max)
          fail(`${label} doit être ≤ ${f.max}.`);
      }
      if (f.minLength != null && value.length < f.minLength) {
        fail(`${label} doit avoir ≥ ${f.minLength} caractères.`);
      }
      if (f.maxLength != null && value.length > f.maxLength) {
        fail(`${label} doit avoir ≤ ${f.maxLength} caractères.`);
      }
      if (f.pattern) {
        try {
          if (!new RegExp(f.pattern).test(value)) {
            fail(`${label} n'est pas au format demandé.`);
          }
        } catch {
          // Regex invalide → validation du champ ignorée (ne bloque pas l'enregistrement du formulaire).
        }
      }
    }
  }

  // ---- Commun : payload → lead (séparation nom + meta) ----

  private async ingest(
    payload: IntakePayloadDto,
    channel: LeadChannel,
    form: { id: string; name: string; tenantId: string | null },
  ) {
    const { firstName, lastName } = this.splitName(payload);
    // Champs extra (inconnus) → meta ; le corps brut est aussi conservé.
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (!KNOWN_KEYS.has(k)) extra[k] = v;
    }
    const lead = await this.leads.createFromIntake({
      firstName,
      lastName,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      phone: typeof payload.phone === 'string' ? payload.phone : undefined,
      companyName:
        typeof payload.companyName === 'string'
          ? payload.companyName
          : undefined,
      source: typeof payload.source === 'string' ? payload.source : form.name,
      channel,
      formId: form.id,
      tenantId: form.tenantId,
      meta: { formName: form.name, fields: extra } as Prisma.InputJsonValue,
    });
    await this.repo.incrementSubmit(form.id);
    return lead;
  }

  // Si un champ unique 'name' est fourni, le séparer en prénom/nom ; sinon utiliser firstName/lastName.
  private splitName(p: IntakePayloadDto): {
    firstName: string;
    lastName: string;
  } {
    let firstName = (p.firstName ?? '').toString().trim();
    let lastName = (p.lastName ?? '').toString().trim();
    if (!firstName && typeof p.name === 'string' && p.name.trim()) {
      const parts = p.name.trim().split(/\s+/);
      firstName = parts.shift() ?? '';
      lastName = parts.join(' ');
    }
    if (!firstName) firstName = 'Bilinmeyen';
    if (!lastName) lastName = '—';
    return {
      firstName: firstName.slice(0, 80),
      lastName: lastName.slice(0, 80),
    };
  }

  private genKey(prefix: string): string {
    return `${prefix}_${randomBytes(24).toString('base64url')}`;
  }

  // Rendre redirectUrl absolu : ajouter https:// si absent. Sinon le navigateur traiterait "google.com"
  // comme relatif → l'embed redirigerait vers un autre formulaire (cassé). Vide → undefined.
  private normalizeUrl(url?: string): string | undefined {
    const v = (url ?? '').trim();
    if (!v) return undefined;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }

  private defaultFields() {
    return [
      { key: 'firstName', label: 'Ad', type: 'text', required: true },
      { key: 'lastName', label: 'Soyad', type: 'text', required: true },
      { key: 'email', label: 'E-posta', type: 'email', required: true },
      { key: 'phone', label: 'Telefon', type: 'tel', required: false },
      { key: 'companyName', label: 'Société', type: 'text', required: false },
    ];
  }

  // Réponse admin : le secret n'est ajouté que si `withSecret` (moment de la création).
  private toAdmin(
    form: {
      id: string;
      name: string;
      publicKey: string;
      secret: string;
      fields: unknown;
      buttonColor: string;
      buttonLabel: string;
      successMessage: string | null;
      redirectUrl: string | null;
      isActive: boolean;
      submitCount: number;
      createdAt: Date;
      updatedAt: Date;
    },
    withSecret: boolean,
  ) {
    const { secret, ...rest } = form;
    return withSecret ? { ...rest, secret } : rest;
  }
}
