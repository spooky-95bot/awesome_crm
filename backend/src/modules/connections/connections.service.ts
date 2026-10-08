// src/modules/connections/connections.service.ts
// İŞ MANTIĞI: entegrasyon bağlantıları. Sır alanları AES-256-GCM ile şifreli saklanır,
// yanıtlarda ASLA dönmez (maskeli). Test, sağlayıcının kimlik bilgileriyle ping atar.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { ConnectionsRepository } from './connections.repository';
import { CreateConnectionDto, UpdateConnectionDto } from './dto/connection.dto';
import { findProvider, PROVIDERS, testConnection } from './provider-catalog';

interface ConnRow {
  id: string;
  provider: string;
  label: string | null;
  status: string;
  secretsEnc: string | null;
  config: unknown;
  createdAt: Date;
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly repo: ConnectionsRepository,
    private readonly crypto: SecretCryptoService,
  ) {}

  catalog() {
    return { cryptoReady: this.crypto.isConfigured(), providers: PROVIDERS };
  }

  async list() {
    const rows = (await this.repo.list()) as ConnRow[];
    return rows.map((r) => this.toView(r));
  }

  async connect(dto: CreateConnectionDto) {
    this.ensureCrypto();
    const provider = findProvider(dto.provider);
    if (!provider) throw new BadRequestException('Fournisseur inconnu.');
    if (!provider.available) {
      throw new BadRequestException("Ce fournisseur n'est pas encore disponible.");
    }
    if (await this.repo.findByProvider(dto.provider)) {
      throw new ConflictException('Ce fournisseur est déjà connecté.');
    }

    const secrets = dto.secrets ?? {};
    const config = dto.config ?? {};
    for (const f of provider.fields) {
      if (!f.required) continue;
      const val = f.secret ? secrets[f.key] : config[f.key];
      if (val === undefined || val === null || val === '') {
        throw new BadRequestException(`Zorunlu alan eksik: ${f.label}`);
      }
    }

    const row = await this.repo.create({
      provider: dto.provider,
      label: dto.label,
      // OAuth2 sağlayıcılar önce yetkilendirme bekler (panelde "Yetkilendir" adımı).
      status: provider.authType === 'oauth2' ? 'pending_auth' : 'connected',
      secretsEnc: this.crypto.encryptJson(secrets),
      config: config as Prisma.InputJsonValue,
    });
    return this.toView(row as ConnRow);
  }

  async update(id: string, dto: UpdateConnectionDto) {
    const row = await this.getOrThrow(id);
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.config !== undefined) data.config = dto.config;
    if (dto.secrets && Object.keys(dto.secrets).length) {
      this.ensureCrypto();
      // Mevcut sırların üstüne yeni verilenleri birleştir (kısmi güncelleme).
      const current = row.secretsEnc
        ? this.crypto.decryptJson<Record<string, string>>(row.secretsEnc)
        : {};
      data.secretsEnc = this.crypto.encryptJson({ ...current, ...dto.secrets });
    }
    const updated = await this.repo.update(
      id,
      data as Prisma.ConnectionUpdateInput,
    );
    return this.toView(updated as ConnRow);
  }

  async test(id: string) {
    const row = await this.getOrThrow(id);
    this.ensureCrypto();
    const secrets = row.secretsEnc
      ? this.crypto.decryptJson<Record<string, string>>(row.secretsEnc)
      : {};
    return testConnection(
      row.provider,
      secrets,
      (row.config ?? {}) as Record<string, unknown>,
    );
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.repo.delete(id);
    return { deleted: true };
  }

  // İÇ KULLANIM (HTTP'ye açılmaz): bağlı & aktif sağlayıcının çözülmüş kimlik bilgileri.
  // Bağlı değilse null döner — çağıran taraf kullanıcıya anlaşılır hata üretir.
  async getCredentials(provider: string): Promise<{
    id: string;
    secrets: Record<string, string>;
    config: Record<string, unknown>;
  } | null> {
    const row = (await this.repo.findByProvider(provider)) as ConnRow | null;
    if (!row || row.status !== 'connected') return null;
    if (!this.crypto.isConfigured()) return null;
    let secrets: Record<string, string> = {};
    if (row.secretsEnc) {
      try {
        secrets = this.crypto.decryptJson<Record<string, string>>(
          row.secretsEnc,
        );
      } catch {
        return null;
      }
    }
    return {
      id: row.id,
      secrets,
      config: (row.config ?? {}) as Record<string, unknown>,
    };
  }

  private async getOrThrow(id: string): Promise<ConnRow> {
    const row = (await this.repo.findById(id)) as ConnRow | null;
    if (!row) throw new NotFoundException('Connexion introuvable.');
    return row;
  }

  private ensureCrypto() {
    if (!this.crypto.isConfigured()) {
      throw new BadRequestException(
        'APP_ENCRYPTION_KEY tanımlı değil — bağlantı sırları saklanamıyor.',
      );
    }
  }

  // Sır ASLA dönmez; yalnız hangi sır alanlarının dolu olduğu (maskeli).
  private toView(r: ConnRow) {
    const provider = findProvider(r.provider);
    let secretSet: string[] = [];
    if (r.secretsEnc && this.crypto.isConfigured()) {
      try {
        const s = this.crypto.decryptJson<Record<string, string>>(r.secretsEnc);
        secretSet = Object.keys(s).filter((k) => (s[k] ?? '') !== '');
      } catch {
        secretSet = [];
      }
    }
    return {
      id: r.id,
      provider: r.provider,
      providerName: provider?.name ?? r.provider,
      category: provider?.category ?? 'other',
      label: r.label,
      status: r.status,
      config: r.config ?? {},
      secretFields: secretSet, // hangi sırlar dolu (değerleri değil)
      createdAt: r.createdAt,
    };
  }
}
