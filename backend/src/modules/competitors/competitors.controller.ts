// src/modules/competitors/competitors.controller.ts — rakip kaydı (brand.read/manage).
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto, UpdateCompetitorDto } from './dto/competitor.dto';

@ApiTags('competitors')
@ApiBearerAuth()
@Controller()
export class CompetitorsController {
  constructor(private readonly service: CompetitorsService) {}

  @Get('brands/:brandId/competitors')
  @Permissions(PERMISSIONS.BRAND.READ)
  list(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.service.list(brandId);
  }

  @Post('brands/:brandId/competitors')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  create(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateCompetitorDto,
  ) {
    return this.service.create(brandId, dto);
  }

  @Post('brands/:brandId/competitors/import-suggested')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI önerilen rakipleri içe aktar (çift atlanır)' })
  importSuggested(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.service.importSuggested(brandId);
  }

  @Patch('competitors/:id')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompetitorDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete('competitors/:id')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
