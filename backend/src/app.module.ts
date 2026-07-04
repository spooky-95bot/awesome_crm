// src/app.module.ts
// Kök modül: global guard (JWT), global throttler, global filter, global interceptor.
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { envValidationSchema } from './config/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { DealsModule } from './modules/deals/deals.module';
import { LeadsModule } from './modules/leads/leads.module';
import { LeadFormsModule } from './modules/lead-forms/lead-forms.module';
import { PipelinesModule } from './modules/pipelines/pipelines.module';
import { BrandingModule } from './modules/branding/branding.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { BrandsModule } from './modules/brands/brands.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { HealthModule } from './modules/health/health.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { AutomationModule } from './modules/automation/automation.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { AiModule } from './modules/ai/ai.module';
import { ProductsModule } from './modules/products/products.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { DataModule } from './modules/data/data.module';
import { AuditModule } from './modules/audit/audit.module';
import { SearchModule } from './modules/search/search.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 5),
        },
      ],
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    DealsModule,
    LeadsModule,
    LeadFormsModule,
    PipelinesModule,
    BrandingModule,
    ConnectionsModule,
    WhatsAppModule,
    AccountingModule,
    BrandsModule,
    InvoicesModule,
    IntegrationsModule,
    HealthModule,
    CompaniesModule,
    ContactsModule,
    MeetingsModule,
    AutomationModule,
    ReportsModule,
    CustomFieldsModule,
    AiModule,
    ProductsModule,
    QuotesModule,
    DataModule,
    AuditModule,
    SearchModule,
    GdprModule,
    TenantsModule,
  ],
  providers: [
    // Guard sırası önemli: kimlik → rol → izin (her biri bir öncekine dayanır).
    // Secure by default: tüm endpoint'ler global JwtAuthGuard ile korumalı.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  // Tenant bağlamı tüm isteklerde çözülür (başlık yoksa no-op).
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
