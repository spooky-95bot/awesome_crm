// src/modules/brands/brands.service.ts
// İŞ MANTIĞI: kullanıcının markaları (marka radarı çekirdeği) + niş zenginleştirme.
// Zenginleştirme AI ile (structured output); AI yoksa deterministik fallback (anahtar kelime çıkarımı).
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AiService } from '../ai/ai.service';
import { BrandsRepository } from './brands.repository';
import { CreateBrandDto, QueryBrandDto, UpdateBrandDto } from './dto/brand.dto';

interface Enrichment {
  niche: string;
  keywords: string[];
  suggestedCompetitors: string[];
  adSearchTerms: string[];
  markets: string[];
}

@Injectable()
export class BrandsService {
  private readonly logger = new Logger(BrandsService.name);

  constructor(
    private readonly repo: BrandsRepository,
    private readonly ai: AiService,
  ) {}

  async create(dto: CreateBrandDto, actor: AuthenticatedUser) {
    return this.repo.create({
      name: dto.name,
      sector: dto.sector,
      niche: dto.niche,
      description: dto.description,
      targetAudience: dto.targetAudience,
      priceBand: dto.priceBand,
      markets: (dto.markets ?? []) as Prisma.InputJsonValue,
      keywords: (dto.keywords ?? []) as Prisma.InputJsonValue,
      answers: {
        knownCompetitors: dto.knownCompetitors ?? [],
      } as Prisma.InputJsonValue,
      createdById: actor.id,
    });
  }

  async findAll(q: QueryBrandDto) {
    const where: Prisma.BrandWhereInput = {};
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { niche: { contains: q.q, mode: 'insensitive' } },
        { sector: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return { data: items, meta: { page: q.page, limit: q.limit, total } };
  }

  async findOne(id: string) {
    const brand = await this.repo.findById(id);
    if (!brand) throw new NotFoundException('Marka bulunamadı');
    return brand;
  }

  async update(id: string, dto: UpdateBrandDto) {
    await this.findOne(id);
    const data: Prisma.BrandUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sector !== undefined) data.sector = dto.sector;
    if (dto.niche !== undefined) data.niche = dto.niche;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.targetAudience !== undefined)
      data.targetAudience = dto.targetAudience;
    if (dto.priceBand !== undefined) data.priceBand = dto.priceBand;
    if (dto.markets !== undefined)
      data.markets = dto.markets as Prisma.InputJsonValue;
    if (dto.keywords !== undefined)
      data.keywords = dto.keywords as Prisma.InputJsonValue;
    return this.repo.update(id, data);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { deleted: true };
  }

  // Niş zenginleştirme: normalize niş + anahtar kelime + rakip önerisi + reklam arama terimleri.
  async enrich(id: string) {
    const brand = await this.findOne(id);
    const known =
      (brand.answers as { knownCompetitors?: string[] } | null)
        ?.knownCompetitors ?? [];

    let result: Enrichment;
    let aiUsed = true;
    try {
      result = await this.ai.completeStructured<Enrichment>(
        'Sen bir pazar araştırması asistanısın. Verilen marka bilgisine göre nişi ' +
          'normalize et, arama/hedefleme için anahtar kelimeler üret, bu nişteki ' +
          'olası rakip markaları öner ve Meta Ad Library için niş-bazlı (marka adı ' +
          'içermeyen) reklam arama terimleri üret. Türkçe içerik, kısa ve isabetli. ' +
          'suggestedCompetitors en fazla 12, keywords en fazla 20, adSearchTerms en fazla 10.',
        JSON.stringify({
          name: brand.name,
          sector: brand.sector,
          niche: brand.niche,
          description: brand.description,
          targetAudience: brand.targetAudience,
          priceBand: brand.priceBand,
          markets: brand.markets,
          knownCompetitors: known,
        }),
        {
          type: 'object',
          properties: {
            niche: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            suggestedCompetitors: { type: 'array', items: { type: 'string' } },
            adSearchTerms: { type: 'array', items: { type: 'string' } },
            markets: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'niche',
            'keywords',
            'suggestedCompetitors',
            'adSearchTerms',
          ],
          additionalProperties: false,
        },
        1200,
      );
    } catch (e) {
      if (!(e instanceof ServiceUnavailableException)) throw e;
      aiUsed = false;
      result = this.fallbackEnrich(brand);
    }

    const updated = await this.repo.update(id, {
      niche: result.niche || brand.niche,
      keywords: result.keywords as Prisma.InputJsonValue,
      answers: {
        knownCompetitors: known,
        suggestedCompetitors: result.suggestedCompetitors,
        adSearchTerms: result.adSearchTerms,
      } as Prisma.InputJsonValue,
      markets:
        result.markets && result.markets.length
          ? (result.markets as Prisma.InputJsonValue)
          : (brand.markets as Prisma.InputJsonValue),
      aiEnriched: aiUsed,
    });
    this.logger.log(`brand.enrich id=${id} ai=${aiUsed}`);
    return { brand: updated, aiUsed, ...result };
  }

  // AI yoksa: niş + açıklama + anahtar kelimelerden basit anahtar kelime çıkarımı.
  private fallbackEnrich(brand: {
    niche: string | null;
    description: string | null;
    keywords: unknown;
  }): Enrichment {
    const text = [brand.niche, brand.description].filter(Boolean).join(' ');
    const stop = new Set([
      'için',
      've',
      'ile',
      'bir',
      'bu',
      'the',
      'and',
      'for',
      'with',
    ]);
    const words = text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !stop.has(w));
    const existing = Array.isArray(brand.keywords)
      ? (brand.keywords as string[])
      : [];
    const keywords = [...new Set([...existing, ...words])].slice(0, 20);
    return {
      niche: brand.niche ?? '',
      keywords,
      suggestedCompetitors: [],
      adSearchTerms: keywords.slice(0, 8),
      markets: [],
    };
  }
}
