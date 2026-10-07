// src/modules/sales/sales.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Permissions(PERMISSIONS.DEAL.READ)
  @ApiOperation({ summary: 'Liste des ventes' })
  findAll(@Query('contactId') contactId?: string) {
    return this.salesService.findAll(contactId);
  }

  @Get('stats')
  @Permissions(PERMISSIONS.DEAL.READ)
  @ApiOperation({ summary: 'Statistiques des ventes' })
  stats() {
    return this.salesService.stats();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.DEAL.READ)
  @ApiOperation({ summary: 'Détail d\'une vente' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.DEAL.CREATE)
  @ApiOperation({ summary: 'Créer une vente' })
  create(@Body() dto: CreateSaleDto) {
    return this.salesService.create(dto);
  }
}
