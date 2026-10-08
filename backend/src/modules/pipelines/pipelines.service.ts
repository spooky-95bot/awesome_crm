// src/modules/pipelines/pipelines.service.ts
// İŞ MANTIĞI: pipeline stage yapılandırması (ekle / yeniden adlandır / sırala / sil).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PipelinesRepository } from './pipelines.repository';
import {
  CreateStageDto,
  ReorderStagesDto,
  UpdateStageDto,
} from './dto/stage.dto';

@Injectable()
export class PipelinesService {
  private readonly logger = new Logger(PipelinesService.name);

  constructor(private readonly repo: PipelinesRepository) {}

  listPipelines() {
    return this.repo.listPipelines();
  }

  async getStages(pipelineId: string) {
    await this.getPipelineOrThrow(pipelineId);
    return this.repo.listStages(pipelineId);
  }

  async addStage(pipelineId: string, dto: CreateStageDto) {
    await this.getPipelineOrThrow(pipelineId);
    const position = (await this.repo.maxPosition(pipelineId)) + 1;
    const stage = await this.repo.createStage({
      pipelineId,
      name: dto.name.trim(),
      position,
      isWon: dto.isWon ?? false,
      isLost: dto.isLost ?? false,
    });
    this.logger.log(`stage.create pipeline=${pipelineId} stage=${stage.id}`);
    return stage;
  }

  async updateStage(pipelineId: string, stageId: string, dto: UpdateStageDto) {
    await this.getStageOrThrow(pipelineId, stageId);
    return this.repo.updateStage(stageId, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.isWon !== undefined ? { isWon: dto.isWon } : {}),
      ...(dto.isLost !== undefined ? { isLost: dto.isLost } : {}),
    });
  }

  async reorder(pipelineId: string, dto: ReorderStagesDto) {
    await this.getPipelineOrThrow(pipelineId);
    const current = await this.repo.listStages(pipelineId);
    const currentIds = new Set(current.map((s) => s.id));
    // Gönderilen küme mevcut stage kümesiyle BİREBİR aynı olmalı (eksik/fazla yok).
    if (
      dto.stageIds.length !== current.length ||
      !dto.stageIds.every((id) => currentIds.has(id))
    ) {
      throw new BadRequestException(
        "stageIds bu pipeline'ın tüm stage'lerini birebir içermeli.",
      );
    }
    return this.repo.reorder(pipelineId, dto.stageIds);
  }

  async removeStage(pipelineId: string, stageId: string) {
    await this.getStageOrThrow(pipelineId, stageId);
    // Son stage silinemez (pipeline boş kalmasın → yeni deal/convert yeri yok).
    if ((await this.repo.countStages(pipelineId)) <= 1) {
      throw new ConflictException('Son stage silinemez.');
    }
    // İçinde açık deal olan stage silinemez (veri kaybı/yetim deal engeli).
    const deals = await this.repo.countDealsInStage(stageId);
    if (deals > 0) {
      throw new ConflictException(
        `Bu stage'de ${deals} deal var; önce taşıyın/silin.`,
      );
    }
    await this.repo.deleteStage(stageId);
    return { deleted: true };
  }

  private async getPipelineOrThrow(id: string) {
    const p = await this.repo.findPipelineById(id);
    if (!p) throw new NotFoundException('Pipeline introuvable');
    return p;
  }

  private async getStageOrThrow(pipelineId: string, stageId: string) {
    const s = await this.repo.findStageById(stageId);
    if (!s || s.pipelineId !== pipelineId) {
      throw new NotFoundException('Étape introuvable');
    }
    return s;
  }
}
