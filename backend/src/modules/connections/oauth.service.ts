// src/modules/connections/oauth.service.ts
// v3.2 OAuth2 akışı: yetkilendirme URL'i üret → callback'te code↔token değişimi →
// token'ları ŞİFRELİ sakla → süresi dolunca refresh grant ile yenile.
// Callback @Public gelir (tarayıcı yönlendirmesi JWT taşımaz) → yetki STATE ile:
// start'ta üretilen rastgele state bağlantı kaydına yazılır; eşleşmeyen state reddedilir.
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { EXT_HTTP, IExtHttpClient } from '../../common/http/ext-http.client';
import { SecretCryptoService } from '../../common/crypto/secret-crypto.service';
import { ConnectionsRepository } from './connections.repository';
import { OAUTH_PROVIDERS } from './oauth-catalog';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 dk

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly repo: ConnectionsRepository,
    private readonly crypto: SecretCryptoService,
    private readonly config: ConfigService,
    @Inject(EXT_HTTP) private readonly http: IExtHttpClient,
  ) {}

  private redirectUri(): string {
    const base = this.config.get<string>(
      'APP_PUBLIC_URL',
      'http://localhost:3000',
    );
    return `${base}/api/v1/connections/oauth/callback`;
  }

  // Adım 1 — yetkilendirme URL'i (panel window.location ile gider).
  async start(connectionId: string) {
    const row = await this.repo.findById(connectionId);
    if (!row) throw new NotFoundException('Connexion introuvable.');
    const def = OAUTH_PROVIDERS[row.provider];
    if (!def) throw new BadRequestException('Fournisseur sans support OAuth.');

    const cfg = (row.config ?? {}) as Record<string, unknown>;
    const clientId = String(cfg.clientId ?? '');
    if (!clientId) throw new BadRequestException('clientId manquant.');

    const state = randomBytes(24).toString('base64url');
    await this.repo.update(connectionId, {
      config: {
        ...cfg,
        oauthState: state,
        oauthStateExp: Date.now() + STATE_TTL_MS,
      } as Prisma.InputJsonValue,
    });

    const url =
      `${def.authorizeUrl}?` +
      new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        scope: def.scope,
        redirect_uri: this.redirectUri(),
        state,
      }).toString();
    return { url };
  }

  // Adım 2 — callback: state doğrula → code'u token'a çevir → şifreli sakla.
  // Dönüş: panel yönlendirme URL'i (başarı/hata query'siyle).
  async callback(params: Record<string, string | undefined>): Promise<string> {
    const panel = this.config.get<string>(
      'APP_PANEL_URL',
      'http://localhost:3001',
    );
    const state = params.state ?? '';
    const code = params.code ?? '';
    if (!state || !code) return `${panel}/connections?oauth=missing`;

    // State ile bağlantıyı bul (tenant context yok → global arama).
    const rows = await this.repo.list();
    const row = rows.find((r) => {
      const cfg = (r.config ?? {}) as Record<string, unknown>;
      return (
        cfg.oauthState === state && Number(cfg.oauthStateExp ?? 0) > Date.now()
      );
    });
    if (!row) {
      this.logger.warn('oauth.callback: eşleşmeyen/başvurusu geçmiş state');
      return `${panel}/connections?oauth=invalid_state`;
    }
    const def = OAUTH_PROVIDERS[row.provider];
    const cfg = (row.config ?? {}) as Record<string, unknown>;

    // Sırlardan clientSecret'ı çöz.
    const secrets = row.secretsEnc
      ? this.crypto.decryptJson<Record<string, string>>(row.secretsEnc)
      : {};

    const basic = Buffer.from(
      `${String(cfg.clientId)}:${secrets.clientSecret ?? ''}`,
    ).toString('base64');
    const res = await this.http.request(
      'POST',
      def.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      }).toString(),
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
    );
    if (res.status < 200 || res.status >= 300) {
      this.logger.warn(`oauth.callback token değişimi hata: ${res.status}`);
      await this.clearState(row.id, cfg);
      return `${panel}/connections?oauth=token_error`;
    }

    let parsed: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    try {
      parsed = JSON.parse(res.body) as typeof parsed;
    } catch {
      return `${panel}/connections?oauth=bad_response`;
    }
    if (!parsed.access_token) return `${panel}/connections?oauth=no_token`;

    // Ekstra callback parametreleri (QBO realmId) config'e.
    const extra: Record<string, unknown> = {};
    for (const key of def.extraCallbackParams) {
      if (params[key]) extra[key] = params[key];
    }

    await this.repo.update(row.id, {
      status: 'connected',
      secretsEnc: this.crypto.encryptJson({
        ...secrets,
        accessToken: parsed.access_token,
        refreshToken: parsed.refresh_token ?? '',
        expiresAt: String(Date.now() + (parsed.expires_in ?? 3600) * 1000),
      }),
      config: {
        ...this.stripState(cfg),
        ...extra,
      } as Prisma.InputJsonValue,
    });
    this.logger.log(`oauth.connected provider=${row.provider}`);
    return `${panel}/connections?connected=${row.provider}`;
  }

  // Geçerli access token döndür; süresi dolduysa refresh grant ile yenile.
  async getFreshAccessToken(provider: string): Promise<{
    accessToken: string;
    config: Record<string, unknown>;
  } | null> {
    const row = await this.repo.findByProvider(provider);
    if (!row || row.status !== 'connected' || !row.secretsEnc) return null;
    const def = OAUTH_PROVIDERS[provider];
    if (!def) return null;
    const secrets = this.crypto.decryptJson<Record<string, string>>(
      row.secretsEnc,
    );
    const cfg = (row.config ?? {}) as Record<string, unknown>;
    const expiresAt = Number(secrets.expiresAt ?? 0);

    if (expiresAt > Date.now() + 60_000) {
      return { accessToken: secrets.accessToken, config: cfg };
    }

    // Yenile.
    if (!secrets.refreshToken) return null;
    const basic = Buffer.from(
      `${String(cfg.clientId)}:${secrets.clientSecret ?? ''}`,
    ).toString('base64');
    const res = await this.http.request(
      'POST',
      def.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: secrets.refreshToken,
      }).toString(),
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
    );
    if (res.status < 200 || res.status >= 300) return null;
    let parsed: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    try {
      parsed = JSON.parse(res.body) as typeof parsed;
    } catch {
      return null;
    }
    if (!parsed.access_token) return null;

    await this.repo.update(row.id, {
      secretsEnc: this.crypto.encryptJson({
        ...secrets,
        accessToken: parsed.access_token,
        refreshToken: parsed.refresh_token ?? secrets.refreshToken,
        expiresAt: String(Date.now() + (parsed.expires_in ?? 3600) * 1000),
      }),
    });
    return { accessToken: parsed.access_token, config: cfg };
  }

  private async clearState(id: string, cfg: Record<string, unknown>) {
    await this.repo.update(id, {
      config: this.stripState(cfg) as Prisma.InputJsonValue,
    });
  }

  private stripState(cfg: Record<string, unknown>): Record<string, unknown> {
    const rest = { ...cfg };
    delete rest.oauthState;
    delete rest.oauthStateExp;
    return rest;
  }
}

export type { OAuthTokens };
