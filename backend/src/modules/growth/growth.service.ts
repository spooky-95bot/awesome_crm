// src/modules/growth/growth.service.ts
// İŞ MANTIĞI: markanın 360° sinyallerini (profil + rakip/reklam/fiyat) toplayıp AI ile
// büyüme oyun kitabı üretir. AI yoksa deterministik özet (fallback).
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { BrandsService } from '../brands/brands.service';
import { GrowthRepository } from './growth.repository';

interface Playbook {
  positioning: string;
  pricingInsight: string;
  nextActions: string[];
  adAngles: string[];
  contentIdeas: string[];
}

@Injectable()
export class GrowthService {
  private readonly logger = new Logger(GrowthService.name);

  constructor(
    private readonly repo: GrowthRepository,
    private readonly brands: BrandsService,
    private readonly ai: AiService,
  ) {}

  async signals(brandId: string) {
    await this.brands.findOne(brandId);
    return this.repo.signals(brandId);
  }

  async playbook(brandId: string) {
    const brand = await this.brands.findOne(brandId);
    const signals = await this.repo.signals(brandId);

    let result: Playbook;
    let aiUsed = true;
    try {
      result = await this.ai.completeStructured<Playbook>(
        'Sen bir marka büyüme (growth) danışmanısın. Verilen marka profili ve pazar ' +
          'sinyallerine göre 360° büyüme oyun kitabı üret: konumlandırma cümlesi, ' +
          'fiyatlandırma içgörüsü (rakip fiyat aralığına göre), sıradaki somut aksiyonlar, ' +
          'reklam açıları ve içerik fikirleri. Türkçe, kısa ve uygulanabilir. ' +
          'nextActions/adAngles/contentIdeas en fazla 6 madde.',
        JSON.stringify({ brand: this.brandCtx(brand), signals }),
        {
          type: 'object',
          properties: {
            positioning: { type: 'string' },
            pricingInsight: { type: 'string' },
            nextActions: { type: 'array', items: { type: 'string' } },
            adAngles: { type: 'array', items: { type: 'string' } },
            contentIdeas: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'positioning',
            'pricingInsight',
            'nextActions',
            'adAngles',
            'contentIdeas',
          ],
          additionalProperties: false,
        },
        1400,
      );
    } catch (e) {
      if (!(e instanceof ServiceUnavailableException)) throw e;
      aiUsed = false;
      result = this.fallback(brand, signals);
    }
    this.logger.log(`growth.playbook brand=${brandId} ai=${aiUsed}`);
    return { aiUsed, signals, ...result };
  }

  private brandCtx(b: {
    name: string;
    niche: string | null;
    priceBand: string | null;
    targetAudience: string | null;
    keywords: unknown;
  }) {
    return {
      name: b.name,
      niche: b.niche,
      priceBand: b.priceBand,
      targetAudience: b.targetAudience,
      keywords: b.keywords,
    };
  }

  // AI yoksa sinyallerden kural-bazlı özet.
  private fallback(
    brand: { niche: string | null; priceBand: string | null },
    s: {
      competitors: number;
      products: number;
      avgPrice: number | null;
      minPrice: number | null;
      maxPrice: number | null;
    },
  ): Playbook {
    const pricing =
      s.avgPrice != null
        ? `Takip edilen ${s.products} rakip üründe ortalama fiyat ${s.avgPrice.toFixed(2)} ` +
          `(aralık ${s.minPrice?.toFixed(2)}–${s.maxPrice?.toFixed(2)}). Fiyat bandın: ${brand.priceBand ?? '—'}.`
        : 'Fiyat verisi yok — Fiyatlar sekmesinden rakip fiyatlarını içe aktar.';
    return {
      positioning: `${brand.niche ?? 'Niş'} alanında ${s.competitors} rakip takip ediliyor.`,
      pricingInsight: pricing,
      nextActions: [
        s.competitors === 0
          ? 'Rakipler sekmesinden rakip ekle veya AI önerilerini içe aktar.'
          : 'Rakip reklamlarını (Reklam radarı) inceleyip kaydet.',
        s.products === 0
          ? 'Fiyatlar sekmesinden rakip fiyatlarını CSV ile içe aktar.'
          : 'Trendler sekmesinden niş anahtar kelime ilgisini izle.',
        'AI oyun kitabı için ANTHROPIC_API_KEY ekleyin (daha zengin öneriler).',
      ],
      adAngles: [],
      contentIdeas: [],
    };
  }
}
