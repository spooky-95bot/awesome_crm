// src/modules/leads/leads.repository.ts
// VERİ ERİŞİMİ: Prisma çağrıları YALNIZCA burada. convert() tek transaction.
import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.LeadCreateInput) {
    return this.prisma.lead.create({ data });
  }

  findById(id: string) {
    return this.prisma.lead.findFirst({ where: { id } });
  }

  async list(where: Prisma.LeadWhereInput, skip: number, take: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total };
  }

  update(id: string, data: Prisma.LeadUpdateInput) {
    return this.prisma.lead.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.lead.delete({ where: { id } });
  }

  // Lead → Contact (+Company) + Deal (varsayılan pipeline). Tek transaction.
  // `overrides` ile Deal/Contact alanları opsiyonel düzenlenebilir (boşsa lead verisi).
  // Tenant otomatik filtresi tx içinde de uygulanır (oluşturmalarda tenantId atanır).
  async convert(
    leadId: string,
    actorId: string,
    overrides: {
      title?: string;
      value?: string;
      currency?: string;
      company?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      stageId?: string;
    } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: leadId } });
      if (!lead) return { notFound: true as const };
      if (lead.status === LeadStatus.CONVERTED) {
        return { alreadyConverted: true as const };
      }

      const pipeline = await tx.pipeline.findFirst({
        where: { isDefault: true },
        include: { stages: { orderBy: { position: 'asc' } } },
      });
      if (!pipeline || !pipeline.stages[0]) {
        return { noPipeline: true as const };
      }
      // Hedef stage: override geçerliyse o; değilse ilk stage.
      const stage =
        pipeline.stages.find((s) => s.id === overrides.stageId) ??
        pipeline.stages[0];
      const owner = lead.ownerId ?? actorId;

      const companyName =
        (overrides.company ?? lead.companyName)?.trim() || null;
      let companyId: string | undefined;
      if (companyName) {
        const company = await tx.company.create({
          data: { name: companyName, ownerId: owner },
        });
        companyId = company.id;
      }

      const email = overrides.email?.trim() || lead.email || null;
      const phone = overrides.phone?.trim() || lead.phone || null;

      const contact = await tx.contact.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          email,
          phone,
          ownerId: owner,
          companyId,
        },
      });

      const max = await tx.deal.aggregate({
        where: { stageId: stage.id, deletedAt: null },
        _max: { rank: true },
      });
      const rank = (max._max.rank ? Number(max._max.rank) : 0) + 1;

      const fullName = `${lead.firstName} ${lead.lastName}`.trim();
      const deal = await tx.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: overrides.title?.trim() || fullName,
          value: overrides.value
            ? new Prisma.Decimal(overrides.value)
            : undefined,
          currency: overrides.value ? overrides.currency || 'EUR' : undefined,
          company: companyName ?? undefined,
          contactName: overrides.contactName?.trim() || fullName,
          email: email ?? undefined,
          phone: phone ?? undefined,
          rank,
          ownerId: owner,
          contactId: contact.id,
          companyId,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: LeadStatus.CONVERTED,
          convertedContactId: contact.id,
          convertedDealId: deal.id,
        },
      });

      return { lead: updatedLead, contact, deal };
    });
  }
}
