// src/modules/brands/brands.controller.ts — Marka Radarı: marka CRUD + niş zenginleştirme.
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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { BrandsService } from './brands.service';
import { CreateBrandDto, QueryBrandDto, UpdateBrandDto } from './dto/brand.dto';

@ApiTags('brands')
@ApiBearerAuth()
@Controller('brands')
export class BrandsController {
  constructor(private readonly service: BrandsService) {}

  @Post()
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  create(@Body() dto: CreateBrandDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Get()
  @Permissions(PERMISSIONS.BRAND.READ)
  findAll(@Query() q: QueryBrandDto) {
    return this.service.findAll(q);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.BRAND.READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBrandDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/enrich')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Niş zenginleştir (AI; yoksa fallback)' })
  enrich(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.enrich(id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
