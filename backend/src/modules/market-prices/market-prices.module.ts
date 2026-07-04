// src/modules/market-prices/market-prices.module.ts — v4.4 rakip fiyat takibi modülü.
import { Module } from '@nestjs/common';
import { BrandsModule } from '../brands/brands.module';
import { MarketPricesController } from './market-prices.controller';
import { MarketPricesService } from './market-prices.service';
import { MarketPricesRepository } from './market-prices.repository';

@Module({
  imports: [BrandsModule],
  controllers: [MarketPricesController],
  providers: [MarketPricesService, MarketPricesRepository],
})
export class MarketPricesModule {}
