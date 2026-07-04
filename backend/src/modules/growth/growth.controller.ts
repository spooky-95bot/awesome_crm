// src/modules/growth/growth.controller.ts — 360° büyüme sinyalleri + AI oyun kitabı (brand.read).
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { GrowthService } from './growth.service';

@ApiTags('growth')
@ApiBearerAuth()
@Controller('brands')
export class GrowthController {
  constructor(private readonly service: GrowthService) {}

  @Get(':brandId/signals')
  @Permissions(PERMISSIONS.BRAND.READ)
  @ApiOperation({
    summary: '360° sinyaller (rakip/reklam/ürün/fiyat sayıları)',
  })
  signals(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.service.signals(brandId);
  }

  @Post(':brandId/playbook')
  @Permissions(PERMISSIONS.BRAND.READ)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI büyüme oyun kitabı (yoksa kural-bazlı özet)' })
  playbook(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.service.playbook(brandId);
  }
}
