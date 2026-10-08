// src/modules/auth/auth.service.ts
// İŞ MANTIĞI: parola doğrulama, token üretimi, refresh rotasyonu + reuse detection.
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthRepository } from './auth.repository';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenPayload } from './strategies/jwt.strategy';

// Bilgi sızıntısı olmadan tek tip dummy hash (kullanıcı yoksa bile bcrypt.compare
// çalıştırmak için — zamanlama saldırısı engeli). Geçersiz bir bcrypt hash'i.
const DUMMY_BCRYPT_HASH =
  '$2b$12$abcdefghijklmnopqrstuuFwN9Yl9c2/4kqfX3sQ1zr2mNQ0Pa8Vy';

export interface RefreshTokenPayload {
  sub: string;
  jti: string; // RefreshToken.id
}

export interface AuthUserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUserView;
}

@Injectable()
export class AuthService {
  private readonly bcryptCost: number;

  constructor(
    private readonly authRepo: AuthRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.bcryptCost = Number(this.config.get<number>('BCRYPT_COST', 12));
  }

  async register(dto: RegisterDto): Promise<AuthUserView> {
    const existing = await this.authRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Cet e-mail est déjà enregistré');
    }
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptCost);
    const user = await this.authRepo.createUser({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    return this.toUserView(user);
  }

  async validateAndLogin(dto: LoginDto): Promise<LoginResult> {
    const user = await this.authRepo.findByEmail(dto.email);
    // Kullanıcı yoksa bile sabit süreli karşılaştırma yap (zamanlama/enumeration engeli).
    const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
    const passwordOk = await bcrypt.compare(dto.password, hashToCompare);

    if (!user || !passwordOk || !user.isActive) {
      // Var/yok ve aktif/pasif ayrımı SIZDIRILMAZ — tek tip mesaj.
      throw new UnauthorizedException('Identifiants invalides');
    }
    return this.issueTokens(user);
  }

  async refresh(rawRefreshToken: string): Promise<LoginResult> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        rawRefreshToken,
        { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Session invalide');
    }

    const stored = await this.authRepo.findRefreshTokenById(payload.jti);
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Session invalide');
    }

    // Reuse detection: iptal edilmiş token tekrar kullanıldıysa → çalıntı şüphesi,
    // kullanıcının TÜM oturumlarını iptal et.
    if (stored.revokedAt) {
      await this.authRepo.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Atteinte à la sécurité de session détectée');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expirée');
    }

    // Hash eşleşmesi: ham token DB'de tutulmaz, SHA-256 hash'i karşılaştırılır.
    if (this.hashToken(rawRefreshToken) !== stored.tokenHash) {
      // Aynı jti, farklı token → manipülasyon. Tüm oturumları iptal et.
      await this.authRepo.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Session invalide');
    }

    const user = await this.authRepo.findById(stored.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session invalide');
    }

    // ROTASYON: eski refresh iptal, yeni access + refresh üret.
    await this.authRepo.revokeRefreshToken(stored.id);
    return this.issueTokens(user);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return; // Cookie yoksa sessizce başarılı (idempotent çıkış).
    }
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        rawRefreshToken,
        { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') },
      );
      const stored = await this.authRepo.findRefreshTokenById(payload.jti);
      if (stored && !stored.revokedAt) {
        await this.authRepo.revokeRefreshToken(stored.id);
      }
    } catch {
      // Geçersiz token'da da çıkış başarılı sayılır (bilgi sızdırma).
    }
  }

  // --- Yardımcılar ---

  private async issueTokens(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantId?: string | null;
    roles: { role: { name: string } }[];
  }): Promise<LoginResult> {
    const roles = user.roles.map((ur) => ur.role.name);

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles,
      tenantId: user.tenantId ?? null,
    };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    });

    // Refresh token: önce DB kaydı oluşturulur (jti almak için), sonra imzalanır,
    // sonra hash'i kayda yazılır.
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '7d');
    const expiresAt = new Date(Date.now() + this.ttlToMs(refreshTtl));

    const record = await this.authRepo.createRefreshToken({
      userId: user.id,
      tokenHash: 'pending', // imzalamadan önce placeholder
      expiresAt,
    });

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      jti: record.id,
    };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    await this.authRepo.updateRefreshTokenHash(
      record.id,
      this.hashToken(refreshToken),
    );

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
      user: this.toUserView(user),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // '15m' | '7d' | '3600s' | '1h' → ms
  private ttlToMs(ttl: string): number {
    const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
    if (!match) {
      // Saf sayı ise saniye varsayılır.
      const asNumber = Number(ttl);
      if (!Number.isNaN(asNumber)) {
        return asNumber * 1000;
      }
      return 7 * 24 * 60 * 60 * 1000; // güvenli varsayılan: 7g
    }
    const value = Number(match[1]);
    const unit = match[2];
    const unitMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * unitMs[unit];
  }

  private toUserView(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: { role: { name: string } }[];
  }): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles.map((ur) => ur.role.name),
    };
  }
}
