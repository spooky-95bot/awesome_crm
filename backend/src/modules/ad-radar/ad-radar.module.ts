// src/modules/ad-radar/ad-radar.module.ts — v4.2 Meta Ad radarı modülü.
import { Module } from '@nestjs/common';
import { BrandsModule } from '../brands/brands.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AdRadarController } from './ad-radar.controller';
import { AdRadarService } from './ad-radar.service';
import { AdRadarRepository } from './ad-radar.repository';

@Module({
  imports: [BrandsModule, ConnectionsModule], // BrandsService + ConnectionsService + EXT_HTTP
  controllers: [AdRadarController],
  providers: [AdRadarService, AdRadarRepository],
})
export class AdRadarModule {}
