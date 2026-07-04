// src/modules/trends/trends.module.ts — v4.3 trend sinyalleri modülü.
import { Module } from '@nestjs/common';
import { BrandsModule } from '../brands/brands.module';
import { ConnectionsModule } from '../connections/connections.module';
import { TrendsController } from './trends.controller';
import { TrendsService } from './trends.service';

@Module({
  imports: [BrandsModule, ConnectionsModule],
  controllers: [TrendsController],
  providers: [TrendsService],
})
export class TrendsModule {}
