// src/modules/market-prices/market-prices.service.ts
// İŞ MANTIĞI: rakip ürün + fiyat takibi. Veri UYUMLU yolla girilir (CSV içe aktarma) —
// kazıma/anti-bot yok. Aynı ürün (brandId+name) yeniden aktarılınca fiyat güncellenir ve
// fiyat geçmişine (PricePoint) yeni nokta eklenir → zaman içinde fiyat izleme.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BrandsService } from '../brands/brands.service';
import { MarketPricesRepository } from './market-prices.repository';
import { ImportPricesDto } from './dto/market-prices.dto';

interface Row {
  name: string;
  price: number;
  currency: string;
  url?: string;
}

@Injectable()
export class MarketPricesService {
  private readonly logger = new Logger(MarketPricesService.name);

  constructor(
    private readonly repo: MarketPricesRepository,
    private readonly brands: BrandsService,
  ) {}

  async list(brandId: string) {
    await this.brands.findOne(brandId);
    return this.repo.listByBrand(brandId);
  }

  async importCsv(brandId: string, dto: ImportPricesDto) {
    await this.brands.findOne(brandId);
    const rows = this.parse(dto.csv);
    let created = 0;
    let updated = 0;
    let points = 0;
    for (const r of rows) {
      const existing = await this.repo.findByName(brandId, r.name);
      if (existing) {
        await this.repo.updatePrice(existing.id, r.price, r.currency);
        await this.repo.addPricePoint(existing.id, r.price);
        updated += 1;
        points += 1;
      } else {
        const p = await this.repo.create({
          brandId,
          name: r.name,
          url: r.url,
          currency: r.currency,
          price: r.price,
          source: 'csv',
        });
        await this.repo.addPricePoint(p.id, r.price);
        created += 1;
        points += 1;
      }
    }
    this.logger.log(
      `prices.import brand=${brandId} created=${created} updated=${updated}`,
    );
    return { created, updated, pricePoints: points, rows: rows.length };
  }

  async remove(id: string) {
    const p = await this.repo.findById(id);
    if (!p) throw new NotFoundException('Ürün bulunamadı');
    await this.repo.delete(id);
    return { deleted: true };
  }

  // Basit CSV çözümleyici: ilk satır başlık (name,price,currency,url). Fiyatı olmayan satır atlanır.
  private parse(csv: string): Row[] {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0]
      .toLowerCase()
      .split(',')
      .map((h) => h.trim());
    const idx = (k: string) => header.indexOf(k);
    const iName = idx('name');
    const iPrice = idx('price');
    const iCur = idx('currency');
    const iUrl = idx('url');
    const rows: Row[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const name = iName >= 0 ? cols[iName] : cols[0];
      const priceRaw = iPrice >= 0 ? cols[iPrice] : cols[1];
      const price = Number(
        String(priceRaw)
          .replace(/[^\d.,]/g, '')
          .replace(',', '.'),
      );
      if (!name || !Number.isFinite(price) || price <= 0) continue;
      rows.push({
        name: name.slice(0, 200),
        price,
        currency: (iCur >= 0 ? cols[iCur] : 'TRY')?.toUpperCase() || 'TRY',
        url: iUrl >= 0 ? cols[iUrl] || undefined : undefined,
      });
    }
    return rows;
  }
}
