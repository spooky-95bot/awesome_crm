// src/modules/competitors/competitors.module.ts — v4.1 rakip kaydı modülü.
import { Module } from '@nestjs/common';
import { BrandsModule } from '../brands/brands.module';
import { CompetitorsController } from './competitors.controller';
import { CompetitorsService } from './competitors.service';
import { CompetitorsRepository } from './competitors.repository';

@Module({
  imports: [BrandsModule], // BrandsService (marka doğrulama + öneri kaynağı)
  controllers: [CompetitorsController],
  providers: [CompetitorsService, CompetitorsRepository],
  exports: [CompetitorsService],
})
export class CompetitorsModule {}
