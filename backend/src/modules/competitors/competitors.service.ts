// src/modules/competitors/competitors.service.ts
// İŞ MANTIĞI: markaya bağlı rakip kaydı — elle ekle + AI önerilerini içe aktar (onay).
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { CompetitorsRepository } from './competitors.repository';
import { CreateCompetitorDto, UpdateCompetitorDto } from './dto/competitor.dto';

@Injectable()
export class CompetitorsService {
  private readonly logger = new Logger(CompetitorsService.name);

  constructor(
    private readonly repo: CompetitorsRepository,
    private readonly brands: BrandsService,
  ) {}

  async list(brandId: string) {
    await this.brands.findOne(brandId); // marka var mı + tenant kapsamı
    return this.repo.listByBrand(brandId);
  }

  async create(brandId: string, dto: CreateCompetitorDto) {
    await this.brands.findOne(brandId);
    return this.repo.create({
      brandId,
      name: dto.name.trim(),
      domain: dto.domain,
      instagram: dto.instagram,
      notes: dto.notes,
      source: 'manual',
    });
  }

  // Markanın AI önerdiği rakipleri (enrich çıktısı) rakip kaydına ekler — çift atlanır.
  async importSuggested(brandId: string) {
    const brand = await this.brands.findOne(brandId);
    const suggested =
      (brand.answers as { suggestedCompetitors?: string[] } | null)
        ?.suggestedCompetitors ?? [];
    if (suggested.length === 0) return { added: 0 };

    // Hem mevcut kayıtlara hem de girdi içindeki tekrarlara karşı dedup.
    const seen = new Set(
      (await this.repo.existingNames(brandId)).map((c) => c.name.toLowerCase()),
    );
    const rows: Prisma.CompetitorUncheckedCreateInput[] = [];
    for (const name of suggested) {
      const key = name?.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push({ brandId, name: name.trim(), source: 'ai_suggested' });
    }
    if (rows.length === 0) return { added: 0 };
    await this.repo.createMany(rows);
    this.logger.log(`competitors.import brand=${brandId} added=${rows.length}`);
    return { added: rows.length };
  }

  async update(id: string, dto: UpdateCompetitorDto) {
    await this.getOrThrow(id);
    const data: Prisma.CompetitorUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.domain !== undefined) data.domain = dto.domain;
    if (dto.instagram !== undefined) data.instagram = dto.instagram;
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.repo.update(id, data);
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.repo.delete(id);
    return { deleted: true };
  }

  private async getOrThrow(id: string) {
    const c = await this.repo.findById(id);
    if (!c) throw new NotFoundException('Rakip bulunamadı');
    return c;
  }
}
