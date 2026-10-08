// src/modules/companies/companies.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CompaniesRepository } from './companies.repository';
import {
  CreateCompanyDto,
  QueryCompanyDto,
  UpdateCompanyDto,
} from './dto/company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly repo: CompaniesRepository) {}

  async create(dto: CreateCompanyDto, actor: AuthenticatedUser) {
    const company = await this.repo.create({ ...dto, ownerId: actor.id });
    return this.view(company);
  }

  async findAll(q: QueryCompanyDto) {
    const where: Prisma.CompanyWhereInput = {};
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { domain: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return {
      data: items.map((c) => this.view(c)),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string) {
    const company = await this.repo.findById(id);
    if (!company) throw new NotFoundException('Société introuvable');
    return this.view(company);
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id);
    return this.view(await this.repo.update(id, dto));
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { deleted: true };
  }

  private view(c: {
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    phone: string | null;
    website: string | null;
    ownerId: string | null;
    createdAt: Date;
    _count?: { contacts: number };
  }) {
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      phone: c.phone,
      website: c.website,
      ownerId: c.ownerId,
      contactCount: c._count?.contacts ?? 0,
      createdAt: c.createdAt,
    };
  }
}
