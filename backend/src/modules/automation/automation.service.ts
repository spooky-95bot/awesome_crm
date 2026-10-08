// src/modules/automation/automation.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AutomationRepository } from './automation.repository';
import {
  CreateRuleDto,
  QueryRuleDto,
  UpdateRuleDto,
} from './dto/automation.dto';

@Injectable()
export class AutomationService {
  constructor(private readonly repo: AutomationRepository) {}

  async create(dto: CreateRuleDto, actor: AuthenticatedUser) {
    return this.repo.create({
      name: dto.name,
      trigger: dto.trigger,
      conditions: dto.conditions
        ? (dto.conditions as unknown as Prisma.InputJsonValue)
        : undefined,
      actions: dto.actions as unknown as Prisma.InputJsonValue,
      createdById: actor.id,
    });
  }

  async findAll(q: QueryRuleDto) {
    const where: Prisma.AutomationRuleWhereInput = {};
    if (q.trigger) where.trigger = q.trigger;
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return { data: items, meta: { page: q.page, limit: q.limit, total } };
  }

  async findOne(id: string) {
    const rule = await this.repo.findById(id);
    if (!rule) throw new NotFoundException('Règle introuvable');
    return rule;
  }

  async update(id: string, dto: UpdateRuleDto) {
    await this.findOne(id);
    const data: Prisma.AutomationRuleUpdateInput = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.conditions !== undefined)
      data.conditions = dto.conditions as unknown as Prisma.InputJsonValue;
    if (dto.actions !== undefined)
      data.actions = dto.actions as unknown as Prisma.InputJsonValue;
    return this.repo.update(id, data);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { deleted: true };
  }
}
