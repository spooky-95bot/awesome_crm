// src/modules/users/users.service.ts
// İŞ MANTIĞI: kullanıcı CRUD, rol atama, son-admin & privilege-escalation korumaları.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Repository userSelect şekli (passwordHash yok).
interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: { role: { id: string; name: string } }[];
}

export interface UserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly bcryptCost: number;

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly config: ConfigService,
  ) {
    this.bcryptCost = Number(this.config.get<number>('BCRYPT_COST', 12));
  }

  async create(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserView> {
    const roleIds = dto.roleIds ?? [];

    // Privilege escalation engeli: rol atamak ayrı bir yetki gerektirir.
    if (
      roleIds.length > 0 &&
      !actor.permissions.includes(PERMISSIONS.ROLE.ASSIGN)
    ) {
      throw new ForbiddenException(
        'Rol atamak için role.assign yetkisi gerekir.',
      );
    }

    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Cet e-mail est déjà enregistré');
    }
    await this.assertRolesExist(roleIds);

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptCost);
    const user = await this.usersRepo.create(
      {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      roleIds,
    );
    this.logger.log(`user.create by=${actor.id} created=${user.id}`);
    return this.toView(user as UserRow);
  }

  async findAll(q: PaginationDto) {
    const { items, total } = await this.usersRepo.findManyPaginated(
      q.skip,
      q.limit,
    );
    return {
      data: (items as UserRow[]).map((u) => this.toView(u)),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string): Promise<UserView> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return this.toView(user as UserRow);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserView> {
    await this.findOne(id); // var mı?
    const user = await this.usersRepo.updateProfile(id, dto);
    return this.toView(user as UserRow);
  }

  async assignRoles(
    id: string,
    roleIds: string[],
    actor: AuthenticatedUser,
  ): Promise<UserView> {
    await this.findOne(id); // hedef var mı?
    await this.assertRolesExist(roleIds);

    const targetIsAdmin = await this.usersRepo.isAdmin(id);
    const willBeAdmin = await this.rolesIncludeAdmin(roleIds);

    // Son admin koruması: son aktif admin'den ADMIN rolü çekilemez.
    if (targetIsAdmin && !willBeAdmin) {
      await this.assertNotLastAdmin(id);
    }

    const user = await this.usersRepo.replaceRoles(id, roleIds);
    this.logger.log(
      `role.assign by=${actor.id} target=${id} roles=[${roleIds.join(',')}]`,
    );
    return this.toView(user as UserRow);
  }

  async setStatus(
    id: string,
    isActive: boolean,
    actor: AuthenticatedUser,
  ): Promise<UserView> {
    await this.findOne(id);
    if (!isActive) {
      await this.assertCanDeactivate(id);
    }
    const user = await this.usersRepo.setStatus(id, isActive);
    this.logger.log(
      `user.status by=${actor.id} target=${id} isActive=${isActive}`,
    );
    return this.toView(user as UserRow);
  }

  // Soft delete = pasifleştirme (docs/02 §7). Sert silme yok.
  async remove(id: string, actor: AuthenticatedUser): Promise<UserView> {
    return this.setStatus(id, false, actor);
  }

  // --- Yardımcılar ---

  private async assertRolesExist(roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;
    const found = await this.usersRepo.countRolesByIds(roleIds);
    if (found !== new Set(roleIds).size) {
      throw new BadRequestException('Identifiant(s) de rôle invalide(s).');
    }
  }

  private async rolesIncludeAdmin(roleIds: string[]): Promise<boolean> {
    if (roleIds.length === 0) return false;
    const names = await this.usersRepo.roleNamesByIds(roleIds);
    return names.includes('ADMIN');
  }

  private async assertNotLastAdmin(targetId: string): Promise<void> {
    const activeAdmins = await this.usersRepo.countActiveAdmins();
    const targetActive = (await this.usersRepo.findById(targetId))?.isActive;
    // Hedef şu an aktif admin ve sistemde tek aktif admin ise → engelle.
    if (activeAdmins <= 1 && targetActive) {
      throw new ConflictException(
        'Son aktif admin korunur: bu işlem son admini yetkisiz/pasif bırakır.',
      );
    }
  }

  private async assertCanDeactivate(targetId: string): Promise<void> {
    const isAdmin = await this.usersRepo.isAdmin(targetId);
    if (isAdmin) {
      await this.assertNotLastAdmin(targetId);
    }
  }

  private toView(u: UserRow): UserView {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      isActive: u.isActive,
      roles: u.roles.map((r) => r.role.name),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }
}
