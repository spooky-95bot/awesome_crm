// src/modules/leads/leads.module.ts — Lead module.
import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadsRepository } from './leads.repository';
import { LeadsEventListener } from './leads-event.listener';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsRepository, LeadsEventListener],
  exports: [LeadsService],
})
export class LeadsModule {}
