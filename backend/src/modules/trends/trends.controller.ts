// src/modules/trends/trends.controller.ts — niş trend sinyalleri (brand.read).
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { TrendsService } from './trends.service';
import { TrendsDto } from './dto/trends.dto';

@ApiTags('trends')
@ApiBearerAuth()
@Controller()
export class TrendsController {
  constructor(private readonly service: TrendsService) {}

  @Post('brands/:brandId/trends')
  @Permissions(PERMISSIONS.BRAND.READ)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Niş anahtar kelimeleri için ilgi-zaman serisi' })
  interest(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: TrendsDto,
  ) {
    return this.service.interestOverTime(brandId, dto);
  }
}
