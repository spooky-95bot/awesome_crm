// src/common/guards/roles.guard.ts
// Kaba taneli yetki kontrolü. @Roles yoksa geçer; varsa kullanıcının rollerinden
// en az biri eşleşmeli. Yetkiler request.user'dan (her istekte DB'den güncel) gelir.
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true; // rol şartı yoksa geç
    }

    const user = ctx.switchToHttp().getRequest().user as
      AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException("Vous n'avez pas la permission pour cette action.");
    }

    const ok = required.some((r) => user.roles.includes(r));
    if (!ok) {
      throw new ForbiddenException("Vous n'avez pas la permission pour cette action.");
    }
    return true;
  }
}
