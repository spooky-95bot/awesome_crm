// src/modules/meetings/meetings.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MeetingsRepository } from './meetings.repository';
import {
  CreateMeetingDto,
  QueryMeetingDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';

@Injectable()
export class MeetingsService {
  constructor(private readonly repo: MeetingsRepository) {}

  async create(dto: CreateMeetingDto, actor: AuthenticatedUser) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('La fin doit être postérieure au début.');
    }
    return this.repo.create({
      title: dto.title,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      location: dto.location,
      notes: dto.notes,
      dealId: dto.dealId,
      contactId: dto.contactId,
      ownerId: actor.id,
    });
  }

  async findAll(q: QueryMeetingDto) {
    const where: Prisma.MeetingWhereInput = {};
    if (q.dealId) where.dealId = q.dealId;
    if (q.from) where.startsAt = { gte: new Date(q.from) };
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return { data: items, meta: { page: q.page, limit: q.limit, total } };
  }

  async findOne(id: string) {
    const m = await this.repo.findById(id);
    if (!m) throw new NotFoundException('Rendez-vous introuvable');
    return m;
  }

  async update(id: string, dto: UpdateMeetingDto) {
    await this.findOne(id);
    const data: Prisma.MeetingUpdateInput = { ...dto };
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) data.endsAt = new Date(dto.endsAt);
    return this.repo.update(id, data);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { deleted: true };
  }
}
