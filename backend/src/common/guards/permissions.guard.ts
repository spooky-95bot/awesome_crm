// src/common/guards/permissions.guard.ts
// İnce taneli yetki kontrolü. @Permissions yoksa geçer; varsa gerekli TÜM izinler
// (AND) kullanıcıda olmalı. İzinler JWT'den DEĞİL, her istekte DB'den yüklenmiş
// request.user.permissions'tan gelir (güncel yetki — docs/02 §3.2 güvenlik notu).
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) {
      return true; // izin şartı yoksa geç
    }

    const user = ctx.switchToHttp().getRequest().user as
      AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission pour cette action.",
      );
    }

    const granted = new Set(user.permissions ?? []);
    const ok = required.every((p) => granted.has(p));
    if (!ok) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission pour cette action.",
      );
    }
    return true;
  }
}
