// src/modules/gdpr/gdpr.service.ts
// İŞ MANTIĞI: KVKK/GDPR — kişisel veriyi dışa aktar (taşınabilirlik) ve sil (unutulma).
// Erase: kişi silinir, bağlı deal'lerin contactId'si null'lanır (tek transaction).
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Kişinin tüm kişisel verisini taşınabilir paket olarak döndürür.
  async exportContact(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!contact) throw new NotFoundException('Contact introuvable');
    const deals = await this.prisma.deal.findMany({
      where: { contactId: id },
      select: { id: true, title: true, status: true, createdAt: true },
    });
    return {
      exportedAt: new Date().toISOString(),
      contact,
      deals,
    };
  }

  // Kişiyi siler; bağlı deal'lerin kişi bağı kaldırılır (iz korunur).
  async eraseContact(id: string, actor: AuthenticatedUser) {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contact introuvable');
    const result = await this.prisma.$transaction(async (tx) => {
      const unlinked = await tx.deal.updateMany({
        where: { contactId: id },
        data: { contactId: null },
      });
      await tx.contact.delete({ where: { id } });
      return { unlinkedDeals: unlinked.count };
    });
    this.logger.log(
      `gdpr.erase contact=${id} by=${actor.id} deals=${result.unlinkedDeals}`,
    );
    return { erased: true, ...result };
  }
}
