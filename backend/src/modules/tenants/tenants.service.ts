// src/modules/tenants/tenants.service.ts
// İŞ MANTIĞI: Tenant oluştur/listele + kullanıcı atama (platform-admin).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TenantsRepository } from './tenants.repository';
import { AssignUserDto, CreateTenantDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private readonly repo: TenantsRepository) {}

  async create(dto: CreateTenantDto, actor: AuthenticatedUser) {
    const exists = await this.repo.findBySlug(dto.slug);
    if (exists) throw new ConflictException('Ce slug est déjà utilisé.');
    const tenant = await this.repo.create({ name: dto.name, slug: dto.slug });
    this.logger.log(`tenant.create by=${actor.id} tenant=${tenant.id}`);
    return tenant;
  }

  list() {
    return this.repo.list();
  }

  async assignUser(
    tenantId: string,
    dto: AssignUserDto,
    actor: AuthenticatedUser,
  ) {
    const tenant = await this.repo.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant introuvable');
    const user = await this.repo.userExists(dto.userId);
    if (!user) throw new BadRequestException('Utilisateur introuvable.');
    const updated = await this.repo.assignUser(dto.userId, tenantId);
    this.logger.log(
      `tenant.assignUser by=${actor.id} user=${dto.userId} tenant=${tenantId}`,
    );
    return updated;
  }
}
