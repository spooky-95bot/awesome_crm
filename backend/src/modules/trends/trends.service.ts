// src/modules/trends/trends.service.ts
// İŞ MANTIĞI: niş anahtar kelimeleri için ilgi-zaman serisi — SerpAPI'nin RESMİ Google Trends
// ucu üzerinden (Google'ı doğrudan kazımaz). Token bağlı SerpAPI connection'ından (şifreli).
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EXT_HTTP, IExtHttpClient } from '../../common/http/ext-http.client';
import { ConnectionsService } from '../connections/connections.service';
import { BrandsService } from '../brands/brands.service';
import { TrendsDto } from './dto/trends.dto';

const SERP = 'https://serpapi.com/search';

interface SerpTimelinePoint {
  date?: string;
  values?: { query?: string; extracted_value?: number; value?: string }[];
}

@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name);

  constructor(
    private readonly brands: BrandsService,
    private readonly connections: ConnectionsService,
    @Inject(EXT_HTTP) private readonly http: IExtHttpClient,
  ) {}

  async interestOverTime(brandId: string, dto: TrendsDto) {
    const brand = await this.brands.findOne(brandId);
    const creds = await this.connections.getCredentials('serpapi');
    if (!creds) {
      throw new BadRequestException(
        'SerpAPI bağlı değil — Bağlantılar sayfasından bağlayın.',
      );
    }

    const kws = (
      dto.keywords && dto.keywords.length
        ? dto.keywords
        : Array.isArray(brand.keywords)
          ? (brand.keywords as string[])
          : []
    )
      .filter(Boolean)
      .slice(0, 5); // Google Trends aynı anda en fazla 5 terim
    if (kws.length === 0) {
      throw new BadRequestException(
        'Anahtar kelime yok — önce markayı zenginleştir.',
      );
    }

    const params = new URLSearchParams({
      engine: 'google_trends',
      q: kws.join(','),
      data_type: 'TIMESERIES',
      api_key: creds.secrets.apiKey,
    });
    if (dto.geo) params.set('geo', dto.geo.toUpperCase());

    const res = await this.http.request('GET', `${SERP}?${params}`, null, {
      Accept: 'application/json',
    });
    if (res.status < 200 || res.status >= 300) {
      this.logger.warn(
        `trends serpapi HTTP ${res.status}: ${res.body.slice(0, 200)}`,
      );
      throw new BadRequestException(
        `Trend isteği başarısız (HTTP ${res.status}).`,
      );
    }

    let parsed: {
      interest_over_time?: { timeline_data?: SerpTimelinePoint[] };
    };
    try {
      parsed = JSON.parse(res.body) as typeof parsed;
    } catch {
      throw new BadRequestException('SerpAPI yanıtı çözümlenemedi.');
    }

    const timeline = (parsed.interest_over_time?.timeline_data ?? []).map(
      (p) => {
        const points: Record<string, number> = {};
        for (let i = 0; i < (p.values ?? []).length; i++) {
          const v = p.values![i];
          const key = v.query ?? kws[i] ?? `kw${i}`;
          points[key] = v.extracted_value ?? (Number(v.value ?? 0) || 0);
        }
        return { date: p.date ?? '', points };
      },
    );
    this.logger.log(
      `trends brand=${brandId} kw=${kws.length} points=${timeline.length}`,
    );
    return { keywords: kws, geo: dto.geo?.toUpperCase() ?? null, timeline };
  }
}
