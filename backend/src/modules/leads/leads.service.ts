// src/modules/leads/leads.service.ts
// İŞ MANTIĞI: nitelenmemiş Lead CRUD + Contact/Deal'e dönüştürme.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LeadChannel, LeadStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LeadsRepository } from './leads.repository';
import {
  ConvertLeadDto,
  CreateLeadDto,
  QueryLeadDto,
  UpdateLeadDto,
} from './dto/lead.dto';

// Form/webhook/CSV gibi katmanların kanal bilgisiyle lead açması için ortak girdi.
export interface IntakeLeadInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  source?: string | null;
  channel: LeadChannel;
  formId?: string | null;
  meta?: Prisma.InputJsonValue;
  tenantId?: string | null;
  ownerId?: string | null;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly repo: LeadsRepository,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateLeadDto, actor: AuthenticatedUser) {
    // Panelden elle oluşturma → MANUAL kanal.
    const lead = await this.repo.create({
      ...dto,
      channel: LeadChannel.MANUAL,
      ownerId: actor.id,
    });
    this.emitCreated(lead);
    return lead;
  }

  // Form/webhook/CSV kanallarından kaynak bilgisiyle lead açar (aktör yok).
  // tenantId açıkça verilir (public yolda tenant context null'dır).
  async createFromIntake(input: IntakeLeadInput) {
    const data: Prisma.LeadCreateInput = {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      companyName: input.companyName ?? undefined,
      source: input.source ?? undefined,
      channel: input.channel,
      meta: input.meta,
      tenantId: input.tenantId ?? undefined,
      ownerId: input.ownerId ?? undefined,
    };
    if (input.formId) data.form = { connect: { id: input.formId } };
    const lead = await this.repo.create(data);
    this.logger.log(
      `lead.intake channel=${input.channel} form=${input.formId ?? '-'} lead=${lead.id}`,
    );
    this.emitCreated(lead);
    return lead;
  }

  // Otomasyon/webhook tetikleyicileri için domain olayı (örn. WhatsApp karşılama).
  private emitCreated(lead: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    channel: LeadChannel;
    source: string | null;
  }) {
    this.events.emit('lead.created', {
      leadId: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName,
      channel: lead.channel,
      source: lead.source,
    });
  }

  async findAll(q: QueryLeadDto) {
    const where: Prisma.LeadWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.channel) where.channel = q.channel;
    if (q.formId) where.formId = q.formId;
    if (q.source) where.source = { contains: q.source, mode: 'insensitive' };
    if (q.q) {
      where.OR = [
        { firstName: { contains: q.q, mode: 'insensitive' } },
        { lastName: { contains: q.q, mode: 'insensitive' } },
        { email: { contains: q.q, mode: 'insensitive' } },
        { companyName: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return { data: items, meta: { page: q.page, limit: q.limit, total } };
  }

  async findOne(id: string) {
    const lead = await this.repo.findById(id);
    if (!lead) throw new NotFoundException('Demande introuvable');
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto) {
    const lead = await this.findOne(id);
    if (lead.status === LeadStatus.CONVERTED) {
      throw new ConflictException('Une demande convertie ne peut pas être modifiée.');
    }
    // CONVERTED yalnız convert akışıyla atanır.
    if (dto.status === LeadStatus.CONVERTED) {
      throw new BadRequestException(
        'CONVERTED durumu yalnız dönüştürme ile atanır (POST /:id/convert).',
      );
    }
    return this.repo.update(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { deleted: true };
  }

  async convert(
    id: string,
    actor: AuthenticatedUser,
    dto: ConvertLeadDto = {},
  ) {
    const result = await this.repo.convert(id, actor.id, dto);
    if ('notFound' in result) {
      throw new NotFoundException('Demande introuvable');
    }
    if ('alreadyConverted' in result) {
      throw new ConflictException('La demande a déjà été convertie.');
    }
    if ('noPipeline' in result) {
      throw new BadRequestException(
        'Varsayılan pipeline bulunamadı (dönüştürme yapılamıyor).',
      );
    }
    this.logger.log(
      `lead.convert by=${actor.id} lead=${id} contact=${result.contact.id} deal=${result.deal.id}`,
    );
    return {
      lead: result.lead,
      contactId: result.contact.id,
      dealId: result.deal.id,
    };
  }
}
