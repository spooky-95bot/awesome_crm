// src/modules/brands/brands.module.ts — v4.0 Marka Radarı modülü.
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { BrandsRepository } from './brands.repository';

@Module({
  imports: [AiModule], // niş zenginleştirme için AiService
  controllers: [BrandsController],
  providers: [BrandsService, BrandsRepository],
  exports: [BrandsService],
})
export class BrandsModule {}
