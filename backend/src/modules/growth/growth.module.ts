// src/modules/growth/growth.module.ts — v4.5 360° büyüme modülü.
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { BrandsModule } from '../brands/brands.module';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';
import { GrowthRepository } from './growth.repository';

@Module({
  imports: [AiModule, BrandsModule],
  controllers: [GrowthController],
  providers: [GrowthService, GrowthRepository],
})
export class GrowthModule {}
