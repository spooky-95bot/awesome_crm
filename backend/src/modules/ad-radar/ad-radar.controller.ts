// src/modules/ad-radar/ad-radar.controller.ts — Meta Ad radarı (brand.read/manage).
import {
  Body,
  Controller,
  Delete,
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
import { AdRadarService } from './ad-radar.service';
import { SaveAdDto, SearchAdsDto } from './dto/ad-radar.dto';

@ApiTags('ad-radar')
@ApiBearerAuth()
@Controller()
export class AdRadarController {
  constructor(private readonly service: AdRadarService) {}

  @Post('brands/:brandId/ad-radar/search')
  @Permissions(PERMISSIONS.BRAND.READ)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nişe göre Meta reklam araması (marka adı vermeden)',
  })
  search(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: SearchAdsDto,
  ) {
    return this.service.search(brandId, dto);
  }

  @Get('brands/:brandId/ad-radar/saved')
  @Permissions(PERMISSIONS.BRAND.READ)
  listSaved(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.service.listSaved(brandId);
  }

  @Post('brands/:brandId/ad-radar/save')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  save(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: SaveAdDto,
  ) {
    return this.service.save(brandId, dto);
  }

  @Delete('ad-radar/saved/:id')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  removeSaved(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeSaved(id);
  }
}
