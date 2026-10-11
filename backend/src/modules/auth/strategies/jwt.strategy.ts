// src/modules/auth/strategies/jwt.strategy.ts
// Stratégie de validation des access tokens. Les permissions (rôles) sont relues
// en base à chaque requête — on ne fait pas confiance aveuglément au token.
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthRepository } from '../auth.repository';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  tenantId?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authRepo: AuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.authRepo.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Authentification requise');
    }
    // Les permissions sont relues en base à chaque requête, puis dédupliquées.
    const permissions = new Set<string>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.id);
      }
    }
    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((ur) => ur.role.name),
      permissions: [...permissions],
      tenantId: user.tenantId ?? null,
    };
  }
}
