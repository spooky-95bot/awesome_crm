// src/modules/contacts/contacts.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ContactsRepository } from './contacts.repository';
import {
  CreateContactDto,
  QueryContactDto,
  UpdateContactDto,
} from './dto/contact.dto';

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyId: string | null;
  ownerId: string | null;
  createdAt: Date;
  company?: { id: string; name: string } | null;
}

@Injectable()
export class ContactsService {
  constructor(private readonly repo: ContactsRepository) {}

  async create(dto: CreateContactDto, actor: AuthenticatedUser) {
    if (dto.companyId) await this.assertCompany(dto.companyId);
    const contact = await this.repo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      title: dto.title,
      ownerId: actor.id,
      ...(dto.companyId ? { company: { connect: { id: dto.companyId } } } : {}),
    });
    return this.view(contact as ContactRow);
  }

  async findAll(q: QueryContactDto) {
    const where: Prisma.ContactWhereInput = {};
    if (q.companyId) where.companyId = q.companyId;
    if (q.q) {
      where.OR = [
        { firstName: { contains: q.q, mode: 'insensitive' } },
        { lastName: { contains: q.q, mode: 'insensitive' } },
        { email: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return {
      data: (items as ContactRow[]).map((c) => this.view(c)),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string) {
    const contact = await this.repo.findById(id);
    if (!contact) throw new NotFoundException('Contact introuvable');
    return this.view(contact as ContactRow);
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.findOne(id);
    if (dto.companyId) await this.assertCompany(dto.companyId);
    const data: Prisma.ContactUpdateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      title: dto.title,
    };
    if (dto.companyId === null) data.company = { disconnect: true };
    else if (dto.companyId) data.company = { connect: { id: dto.companyId } };
    return this.view((await this.repo.update(id, data)) as ContactRow);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { deleted: true };
  }

  private async assertCompany(companyId: string) {
    const exists = await this.repo.companyExists(companyId);
    if (!exists) throw new BadRequestException('companyId invalide.');
  }

  private view(c: ContactRow) {
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      title: c.title,
      companyId: c.companyId,
      company: c.company ?? null,
      ownerId: c.ownerId,
      createdAt: c.createdAt,
    };
  }
}
