// src/modules/data/data.controller.ts
// SADECE HTTP. Export @Res() ile ham CSV döndürür (standart zarf bypass).
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { DataService, ExportEntity, MergeEntity } from './data.service';
import { ImportDto, MergeDto } from './dto/data.dto';

const EXPORTABLE: ExportEntity[] = ['contacts', 'companies', 'deals'];
const MERGEABLE: MergeEntity[] = ['contacts', 'companies'];

@ApiTags('data')
@ApiBearerAuth()
@Controller('data')
export class DataController {
  constructor(private readonly service: DataService) {}

  @Get('export/:entity')
  @Permissions(PERMISSIONS.DATA.EXPORT)
  @ApiOperation({ summary: 'CSV dışa aktar (contacts|companies|deals)' })
  async export(
    @Param('entity') entity: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!EXPORTABLE.includes(entity as ExportEntity)) {
      throw new BadRequestException('Type invalide.');
    }
    const csv = await this.service.exportCsv(entity as ExportEntity);
    res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${entity}.csv"`)
      .send(csv);
  }

  @Post('import/:entity')
  @Permissions(PERMISSIONS.DATA.IMPORT)
  @ApiOperation({ summary: 'CSV içe aktar (contacts|companies), dedup ile' })
  import(
    @Param('entity') entity: string,
    @Body() dto: ImportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (entity === 'contacts') {
      return this.service.importContacts(dto.csv, actor);
    }
    if (entity === 'companies') {
      return this.service.importCompanies(dto.csv, actor);
    }
    throw new BadRequestException("Type d'import invalide.");
  }

  @Get('duplicates/:entity')
  @Permissions(PERMISSIONS.DATA.MERGE)
  @ApiOperation({ summary: 'Yinelenen kayıtları listele (contacts|companies)' })
  duplicates(@Param('entity') entity: string) {
    if (!MERGEABLE.includes(entity as MergeEntity)) {
      throw new BadRequestException('Type invalide.');
    }
    return this.service.duplicates(entity as MergeEntity);
  }

  @Post('merge/:entity')
  @Permissions(PERMISSIONS.DATA.MERGE)
  @ApiOperation({ summary: 'İki kaydı birleştir (kaynak → hedef, sonra sil)' })
  merge(
    @Param('entity') entity: string,
    @Body() dto: MergeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!MERGEABLE.includes(entity as MergeEntity)) {
      throw new BadRequestException('Type invalide.');
    }
    return this.service.merge(entity as MergeEntity, dto, actor);
  }
}
