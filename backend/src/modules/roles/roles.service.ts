// src/modules/roles/roles.service.ts
// İŞ MANTIĞI: rol/izin yönetimi. ADMIN (süper) rolü kilitlenmeye karşı korunur.
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ROLE_NAMES } from '../../common/constants/permission.enum';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RolesRepository } from './roles.repository';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { action: string } }[];
}

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly rolesRepo: RolesRepository) {}

  async create(
    dto: CreateRoleDto,
    actor: AuthenticatedUser,
  ): Promise<RoleView> {
    const existing = await this.rolesRepo.findByName(dto.name);
    if (existing) {
      throw new ConflictException('Ce nom de rôle existe déjà.');
    }
    const role = await this.rolesRepo.create(
      dto.name,
      dto.description,
      dto.permissions ?? [],
    );
    this.logger.log(`role.create by=${actor.id} role=${role.id}(${dto.name})`);
    return this.toView(role as RoleRow);
  }

  async findAll(): Promise<RoleView[]> {
    const roles = await this.rolesRepo.findAll();
    return (roles as RoleRow[]).map((r) => this.toView(r));
  }

  async findOne(id: string): Promise<RoleView> {
    const role = await this.rolesRepo.findById(id);
    if (!role) {
      throw new NotFoundException('Rôle introuvable');
    }
    return this.toView(role as RoleRow);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleView> {
    await this.findOne(id);
    const role = await this.rolesRepo.updateDescription(id, dto.description);
    return this.toView(role as RoleRow);
  }

  async assignPermissions(
    id: string,
    permissions: string[],
    actor: AuthenticatedUser,
  ): Promise<RoleView> {
    const current = await this.findOne(id);
    // ADMIN süper rolü her zaman tam yetkili kalmalı — izinleri çıkarılamaz (lockout engeli).
    if (current.name === ROLE_NAMES.ADMIN) {
      throw new ConflictException(
        'ADMIN rolünün izinleri değiştirilemez (sistem kilidi engeli).',
      );
    }
    const role = await this.rolesRepo.replacePermissions(id, permissions);
    this.logger.log(
      `role.permissions by=${actor.id} role=${id} perms=[${permissions.join(',')}]`,
    );
    return this.toView(role as RoleRow);
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<{ deleted: true }> {
    const role = await this.findOne(id);
    if (role.name === ROLE_NAMES.ADMIN) {
      throw new ConflictException('Le rôle ADMIN ne peut pas être supprimé.');
    }
    await this.rolesRepo.delete(id);
    this.logger.log(`role.delete by=${actor.id} role=${id}(${role.name})`);
    return { deleted: true };
  }

  private toView(r: RoleRow): RoleView {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((p) => p.permission.action),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
