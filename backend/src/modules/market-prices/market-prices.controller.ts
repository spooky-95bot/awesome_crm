// src/modules/market-prices/market-prices.controller.ts — rakip ürün/fiyat (brand.read/manage).
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
import { MarketPricesService } from './market-prices.service';
import { ImportPricesDto } from './dto/market-prices.dto';

@ApiTags('market-prices')
@ApiBearerAuth()
@Controller()
export class MarketPricesController {
  constructor(private readonly service: MarketPricesService) {}

  @Get('brands/:brandId/products')
  @Permissions(PERMISSIONS.BRAND.READ)
  list(@Param('brandId', ParseUUIDPipe) brandId: string) {
    return this.service.list(brandId);
  }

  @Post('brands/:brandId/products/import-csv')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rakip ürün/fiyat CSV içe aktar (fiyat geçmişi eklenir)',
  })
  importCsv(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: ImportPricesDto,
  ) {
    return this.service.importCsv(brandId, dto);
  }

  @Delete('products/:id')
  @Permissions(PERMISSIONS.BRAND.MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
