// src/modules/search/search.controller.ts
// SADECE HTTP. Kimlik doğrulanmış her kullanıcı arar; sonuçlar izne göre süzülür.
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  search(@Query('q') q: string, @CurrentUser() actor: AuthenticatedUser) {
    if (!q || q.trim().length < 2) {
      throw new BadRequestException('Le terme de recherche doit comporter au moins 2 caractères.');
    }
    return this.service.search(q, actor);
  }
}
