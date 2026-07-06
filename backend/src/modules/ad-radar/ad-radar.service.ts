// src/modules/ad-radar/ad-radar.service.ts
// İŞ MANTIĞI: Meta Ad Library'de NİŞE göre (marka adı vermeden) reklam araması + kaydetme.
// Resmi Graph API `ads_archive` ucu; token bağlı Meta Ad Library connection'ından (şifreli).
// NOT: API'nin döndürdüğü kapsam token'ın erişim düzeyine bağlıdır (Meta politikası).
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXT_HTTP, IExtHttpClient } from '../../common/http/ext-http.client';
import { metaErrorMessage } from '../../common/http/meta-error';
import { ConnectionsService } from '../connections/connections.service';
import { BrandsService } from '../brands/brands.service';
import { AdRadarRepository } from './ad-radar.repository';
import { SaveAdDto, SearchAdsDto } from './dto/ad-radar.dto';

const GRAPH = 'https://graph.facebook.com/v20.0/ads_archive';

interface RawAd {
  id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  publisher_platforms?: string[];
}

@Injectable()
export class AdRadarService {
  private readonly logger = new Logger(AdRadarService.name);

  constructor(
    private readonly repo: AdRadarRepository,
    private readonly brands: BrandsService,
    private readonly connections: ConnectionsService,
    @Inject(EXT_HTTP) private readonly http: IExtHttpClient,
  ) {}

  async search(brandId: string, dto: SearchAdsDto) {
    const brand = await this.brands.findOne(brandId);
    const creds = await this.connections.getCredentials('meta_ads');
    if (!creds) {
      throw new BadRequestException(
        'Meta Ad Library bağlı değil — Bağlantılar sayfasından bağlayın.',
      );
    }

    // Terimler: verilmezse markanın niş reklam-arama terimleri / anahtar kelimeleri.
    const answers = brand.answers as { adSearchTerms?: string[] } | null;
    const terms =
      dto.searchTerms && dto.searchTerms.length
        ? dto.searchTerms
        : (answers?.adSearchTerms ??
          (Array.isArray(brand.keywords) ? (brand.keywords as string[]) : []));
    if (terms.length === 0) {
      throw new BadRequestException(
        'Arama terimi yok — önce markayı zenginleştir veya terim gir.',
      );
    }

    const params = new URLSearchParams({
      ad_reached_countries: JSON.stringify([dto.country.toUpperCase()]),
      search_terms: terms.join(' '),
      ad_type: 'ALL',
      ad_active_status: dto.activeStatus ?? 'ACTIVE',
      fields:
        'id,page_name,ad_creative_bodies,ad_snapshot_url,ad_delivery_start_time,publisher_platforms',
      limit: '25',
      access_token: creds.secrets.accessToken,
    });

    const res = await this.http.request('GET', `${GRAPH}?${params}`, null, {
      Accept: 'application/json',
    });
    if (res.status < 200 || res.status >= 300) {
      // Meta'nın API hata mesajı (token/PII içermez) kullanıcıya gösterilir → net teşhis.
      this.logger.warn(
        `ad-radar meta HTTP ${res.status}: ${res.body.slice(0, 200)}`,
      );
      throw new BadRequestException(
        `Meta Ad Library: ${metaErrorMessage(res.body)}`,
      );
    }

    let parsed: { data?: RawAd[] };
    try {
      parsed = JSON.parse(res.body) as typeof parsed;
    } catch {
      throw new BadRequestException('Meta yanıtı çözümlenemedi.');
    }

    const ads = (parsed.data ?? []).map((a) => ({
      adArchiveId: a.id ?? '',
      pageName: a.page_name ?? null,
      body: (a.ad_creative_bodies ?? []).join('\n') || null,
      snapshotUrl: a.ad_snapshot_url ?? null,
      startTime: a.ad_delivery_start_time ?? null,
      platforms: a.publisher_platforms ?? [],
    }));
    this.logger.log(
      `ad-radar brand=${brandId} country=${dto.country} results=${ads.length}`,
    );
    return { terms, country: dto.country.toUpperCase(), ads };
  }

  async listSaved(brandId: string) {
    await this.brands.findOne(brandId);
    return this.repo.listSaved(brandId);
  }

  async save(brandId: string, dto: SaveAdDto) {
    await this.brands.findOne(brandId);
    return this.repo.upsert({
      brandId,
      adArchiveId: dto.adArchiveId,
      pageName: dto.pageName,
      body: dto.body,
      snapshotUrl: dto.snapshotUrl,
      startTime: dto.startTime,
      platforms: [] as unknown as Prisma.InputJsonValue,
    });
  }

  async removeSaved(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Kayıtlı reklam bulunamadı');
    await this.repo.delete(id);
    return { deleted: true };
  }
}
