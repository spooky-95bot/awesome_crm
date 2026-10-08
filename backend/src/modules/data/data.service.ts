// src/modules/data/data.service.ts
// İŞ MANTIĞI: CSV içe/dışa aktarma + duplicate tespiti + birleştirme.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DataRepository } from './data.repository';
import { parseCsv, toCsv } from './csv.util';
import { MergeDto } from './dto/data.dto';

export type ExportEntity = 'contacts' | 'companies' | 'deals';
export type MergeEntity = 'contacts' | 'companies';

export interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor(private readonly repo: DataRepository) {}

  // --- Export ---

  async exportCsv(entity: ExportEntity): Promise<string> {
    switch (entity) {
      case 'contacts': {
        const rows = await this.repo.listContacts();
        return toCsv(
          rows.map((c) => ({
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email ?? '',
            phone: c.phone ?? '',
            title: c.title ?? '',
            company: c.company?.name ?? '',
          })),
          [
            { key: 'firstName', header: 'firstName' },
            { key: 'lastName', header: 'lastName' },
            { key: 'email', header: 'email' },
            { key: 'phone', header: 'phone' },
            { key: 'title', header: 'title' },
            { key: 'company', header: 'company' },
          ],
        );
      }
      case 'companies': {
        const rows = await this.repo.listCompanies();
        return toCsv(
          rows.map((c) => ({
            name: c.name,
            domain: c.domain ?? '',
            industry: c.industry ?? '',
            phone: c.phone ?? '',
            website: c.website ?? '',
          })),
          [
            { key: 'name', header: 'name' },
            { key: 'domain', header: 'domain' },
            { key: 'industry', header: 'industry' },
            { key: 'phone', header: 'phone' },
            { key: 'website', header: 'website' },
          ],
        );
      }
      case 'deals': {
        const rows = await this.repo.listDeals();
        return toCsv(
          rows.map((d) => ({
            title: d.title,
            stage: d.stage?.name ?? '',
            value: d.value ? d.value.toString() : '',
            currency: d.currency,
            status: d.status,
            company: d.company ?? '',
          })),
          [
            { key: 'title', header: 'title' },
            { key: 'stage', header: 'stage' },
            { key: 'value', header: 'value' },
            { key: 'currency', header: 'currency' },
            { key: 'status', header: 'status' },
            { key: 'company', header: 'company' },
          ],
        );
      }
      default:
        throw new BadRequestException("Type d'export invalide.");
    }
  }

  // --- Import ---

  async importContacts(
    csv: string,
    actor: AuthenticatedUser,
  ): Promise<ImportResult> {
    const rows = parseCsv(csv);
    const res: ImportResult = { created: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const firstName = r.firstName;
      const lastName = r.lastName;
      if (!firstName || !lastName) {
        res.errors.push({ row: i + 2, message: 'firstName/lastName zorunlu' });
        continue;
      }
      // Dedup: aynı e-posta varsa atla.
      if (r.email) {
        const existing = await this.repo.findContactByEmail(r.email);
        if (existing) {
          res.skipped++;
          continue;
        }
      }
      await this.repo.createContact({
        firstName,
        lastName,
        email: r.email || null,
        phone: r.phone || null,
        title: r.title || null,
      });
      res.created++;
    }
    this.logger.log(
      `data.import contacts by=${actor.id} created=${res.created} skipped=${res.skipped}`,
    );
    return res;
  }

  async importCompanies(
    csv: string,
    actor: AuthenticatedUser,
  ): Promise<ImportResult> {
    const rows = parseCsv(csv);
    const res: ImportResult = { created: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.name) {
        res.errors.push({ row: i + 2, message: 'name zorunlu' });
        continue;
      }
      // Dedup: aynı ad varsa atla.
      const existing = await this.repo.findCompanyByName(r.name);
      if (existing) {
        res.skipped++;
        continue;
      }
      await this.repo.createCompany({
        name: r.name,
        domain: r.domain || null,
        industry: r.industry || null,
        phone: r.phone || null,
        website: r.website || null,
      });
      res.created++;
    }
    this.logger.log(
      `data.import companies by=${actor.id} created=${res.created} skipped=${res.skipped}`,
    );
    return res;
  }

  // --- Duplicate tespiti ---

  duplicates(entity: MergeEntity) {
    return entity === 'contacts'
      ? this.repo.duplicateContacts()
      : this.repo.duplicateCompanies();
  }

  // --- Birleştirme ---

  async merge(entity: MergeEntity, dto: MergeDto, actor: AuthenticatedUser) {
    if (dto.targetId === dto.sourceId) {
      throw new BadRequestException('La cible et la source ne peuvent pas être identiques.');
    }
    if (entity === 'contacts') {
      const [t, s] = await Promise.all([
        this.repo.getContact(dto.targetId),
        this.repo.getContact(dto.sourceId),
      ]);
      if (!t || !s) throw new NotFoundException('Contact introuvable.');
      const r = await this.repo.mergeContacts(dto.targetId, dto.sourceId);
      this.logger.log(
        `data.merge contacts by=${actor.id} ${dto.sourceId}->${dto.targetId} deals=${r.movedDeals}`,
      );
      return { merged: true, ...r };
    }
    const [t, s] = await Promise.all([
      this.repo.getCompany(dto.targetId),
      this.repo.getCompany(dto.sourceId),
    ]);
    if (!t || !s) throw new NotFoundException('Société introuvable.');
    const r = await this.repo.mergeCompanies(dto.targetId, dto.sourceId);
    this.logger.log(
      `data.merge companies by=${actor.id} ${dto.sourceId}->${dto.targetId}`,
    );
    return { merged: true, ...r };
  }
}
