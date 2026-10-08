// src/modules/deals/deals.service.ts
// İŞ MANTIĞI: Deal CRUD, Kanban board, atomik move (rank), sahiplik tabanlı erişim.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DealStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ROLE_NAMES } from '../../common/constants/permission.enum';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DealsRepository } from './deals.repository';
import { computeRank, RANK_GAP } from './rank.util';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { MoveDealDto } from './dto/move-deal.dto';
import { AssignDealDto } from './dto/assign-deal.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { QueryDealDto } from './dto/query-deal.dto';

// Tüm deal'lere yazabilen roller (sahiplikten bağımsız).
const MANAGE_ALL_ROLES: string[] = [ROLE_NAMES.ADMIN, ROLE_NAMES.MANAGER];

interface DealRecord {
  id: string;
  pipelineId: string;
  stageId: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  value: Prisma.Decimal | null;
  currency: string;
  rank: Prisma.Decimal;
  ownerId: string | null;
  status: DealStatus;
  customFields: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    private readonly repo: DealsRepository,
    private readonly events: EventEmitter2,
    private readonly customFields: CustomFieldsService,
  ) {}

  async create(dto: CreateDealDto, actor: AuthenticatedUser) {
    const stage = await this.repo.getStage(dto.stageId);
    if (!stage) {
      throw new BadRequestException('stageId invalide.');
    }
    // Pipeline tutarlılığı: stage verilen pipeline'a ait olmalı.
    if (stage.pipelineId !== dto.pipelineId) {
      throw new BadRequestException("Stage, belirtilen pipeline'a ait değil.");
    }

    // Özel alanları tanımlara göre doğrula (v2.5).
    const customFields = await this.customFields.validateValues(
      'DEAL',
      dto.customFields,
      true,
    );

    // Yeni kart sütunun sonuna yerleşir.
    const maxRank = await this.repo.maxRankInStage(dto.stageId);
    const rank = (maxRank ?? 0) + RANK_GAP;

    const created = await this.repo.create({
      title: dto.title,
      contactName: dto.contactName,
      email: dto.email,
      phone: dto.phone,
      company: dto.company,
      value: dto.value ?? null,
      currency: dto.currency ?? 'EUR',
      customFields: customFields as Prisma.InputJsonValue,
      rank,
      status: DealStatus.OPEN,
      pipeline: { connect: { id: dto.pipelineId } },
      stage: { connect: { id: dto.stageId } },
      // Oluşturan kullanıcı varsayılan sahip olur.
      owner: { connect: { id: actor.id } },
    });
    this.logger.log(`deal.create by=${actor.id} deal=${created.id}`);
    // Domain olayı yay (entegrasyon handler'ları dinler — gevşek bağlılık).
    this.events.emit('deal.created', {
      dealId: created.id,
      title: created.title,
      pipelineId: created.pipelineId,
    });
    return this.toView(created as DealRecord);
  }

  async findBoard(pipelineId: string) {
    const pipeline = await this.repo.getPipeline(pipelineId);
    if (!pipeline) {
      throw new NotFoundException('Pipeline introuvable');
    }
    const stages = await this.repo.board(pipelineId);
    return {
      pipelineId,
      stages: stages.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        isWon: s.isWon,
        isLost: s.isLost,
        deals: s.deals.map((l) => this.toView(l as DealRecord)),
      })),
    };
  }

  async findAll(q: QueryDealDto) {
    const where: Prisma.DealWhereInput = { deletedAt: null };
    if (q.pipelineId) where.pipelineId = q.pipelineId;
    if (q.stageId) where.stageId = q.stageId;
    if (q.status) where.status = q.status as DealStatus;
    if (q.q) {
      // Prisma parametrik → injection yok.
      where.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        { company: { contains: q.q, mode: 'insensitive' } },
        { contactName: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return {
      data: (items as DealRecord[]).map((l) => this.toView(l)),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string) {
    const deal = await this.getDealOrThrow(id);
    const activities = await this.repo.getActivities(id);
    return { ...this.toView(deal as DealRecord), activities };
  }

  async update(id: string, dto: UpdateDealDto, actor: AuthenticatedUser) {
    const deal = await this.getDealOrThrow(id);
    this.assertCanWrite(deal, actor);
    const data: Prisma.DealUpdateInput = {
      title: dto.title,
      contactName: dto.contactName,
      email: dto.email,
      phone: dto.phone,
      company: dto.company,
      value: dto.value ?? undefined,
      currency: dto.currency,
    };
    if (dto.customFields !== undefined) {
      data.customFields = (await this.customFields.validateValues(
        'DEAL',
        dto.customFields,
        false,
      )) as Prisma.InputJsonValue;
    }
    const updated = await this.repo.update(id, data);
    return this.toView(updated as DealRecord);
  }

  async move(id: string, dto: MoveDealDto, actor: AuthenticatedUser) {
    const deal = await this.getDealOrThrow(id);
    this.assertCanWrite(deal, actor);

    const toStage = await this.repo.getStage(dto.toStageId);
    if (!toStage) {
      throw new BadRequestException('Étape cible invalide.');
    }
    // Cross-pipeline taşıma engeli.
    if (toStage.pipelineId !== deal.pipelineId) {
      throw new BadRequestException(
        "Deal farklı bir pipeline'ın stage'ine taşınamaz.",
      );
    }

    const beforeRank = await this.resolveNeighborRank(
      dto.beforeDealId,
      dto.toStageId,
    );
    const afterRank = await this.resolveNeighborRank(
      dto.afterDealId,
      dto.toStageId,
    );

    let rank: number;
    if (beforeRank === null && afterRank === null) {
      const maxRank = await this.repo.maxRankInStage(dto.toStageId);
      rank = (maxRank ?? 0) + RANK_GAP;
    } else {
      rank = computeRank(beforeRank, afterRank);
    }

    const status = toStage.isWon
      ? DealStatus.WON
      : toStage.isLost
        ? DealStatus.LOST
        : DealStatus.OPEN;

    const moved = await this.repo.applyMove({
      id,
      toStageId: dto.toStageId,
      rank,
      status,
      fromStageId: deal.stageId,
      userId: actor.id,
    });
    this.logger.log(
      `deal.move by=${actor.id} deal=${id} ${deal.stageId}->${dto.toStageId} rank=${rank}`,
    );
    this.events.emit('deal.moved', {
      dealId: id,
      fromStageId: deal.stageId,
      toStageId: dto.toStageId,
      status,
    });
    return this.toView(moved as DealRecord);
  }

  async assign(id: string, dto: AssignDealDto, actor: AuthenticatedUser) {
    const deal = await this.getDealOrThrow(id);
    this.assertCanWrite(deal, actor);
    const ownerId = dto.ownerId ?? null;
    if (ownerId) {
      const exists = await this.repo.userExists(ownerId);
      if (!exists) {
        throw new BadRequestException('Utilisateur à assigner introuvable.');
      }
    }
    const updated = await this.repo.setOwner(id, ownerId);
    this.logger.log(`deal.assign by=${actor.id} deal=${id} owner=${ownerId}`);
    return this.toView(updated as DealRecord);
  }

  async addActivity(
    id: string,
    dto: CreateActivityDto,
    actor: AuthenticatedUser,
  ) {
    const deal = await this.getDealOrThrow(id);
    this.assertCanWrite(deal, actor);
    const payload: Prisma.InputJsonValue = {
      ...(dto.payload ?? {}),
      ...(dto.note ? { note: dto.note } : {}),
    };
    return this.repo.addActivity(id, actor.id, dto.type, payload);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const deal = await this.getDealOrThrow(id);
    this.assertCanWrite(deal, actor);
    await this.repo.softDelete(id);
    this.logger.log(`deal.delete by=${actor.id} deal=${id}`);
    return { deleted: true };
  }

  // --- Yardımcılar ---

  private async getDealOrThrow(id: string) {
    const deal = await this.repo.getDeal(id);
    if (!deal) {
      throw new NotFoundException('Vente introuvable');
    }
    return deal;
  }

  // Sahiplik: MANAGER/ADMIN hepsine; diğerleri yalnız kendi deal'ine yazabilir (IDOR engeli).
  private assertCanWrite(
    deal: { ownerId: string | null },
    actor: AuthenticatedUser,
  ): void {
    const managesAll = actor.roles.some((r) => MANAGE_ALL_ROLES.includes(r));
    if (managesAll) return;
    if (deal.ownerId && deal.ownerId === actor.id) return;
    throw new ForbiddenException("Vous n'avez pas les droits sur cette vente.");
  }

  // Komşu kart rank'ini çözer; kart aynı hedef stage'de ve silinmemiş olmalı (IDOR/tutarlılık).
  private async resolveNeighborRank(
    dealId: string | undefined,
    toStageId: string,
  ): Promise<number | null> {
    if (!dealId) return null;
    const neighbor = await this.repo.getDeal(dealId);
    if (!neighbor || neighbor.stageId !== toStageId) {
      throw new BadRequestException(
        'Komşu kart hedef sütunda bulunamadı (geçersiz before/afterDealId).',
      );
    }
    return Number(neighbor.rank);
  }

  private toView(l: DealRecord) {
    return {
      id: l.id,
      pipelineId: l.pipelineId,
      stageId: l.stageId,
      title: l.title,
      contactName: l.contactName,
      email: l.email,
      phone: l.phone,
      company: l.company,
      // Decimal alanlar string olarak döner (float kaybı yok).
      value: l.value !== null ? l.value.toString() : null,
      currency: l.currency,
      rank: l.rank.toString(),
      ownerId: l.ownerId,
      status: l.status,
      customFields: l.customFields ?? {},
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }
}
