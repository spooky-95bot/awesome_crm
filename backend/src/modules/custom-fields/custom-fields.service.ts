// src/modules/custom-fields/custom-fields.service.ts
// Özel alan tanımları (CRUD) + değer doğrulama/dönüştürme (entity bağımsız, DRY).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomFieldDef,
  CustomFieldEntity,
  CustomFieldType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFieldDefDto,
  QueryFieldDefDto,
  UpdateFieldDefDto,
} from './dto/custom-field.dto';

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFieldDefDto) {
    const exists = await this.prisma.customFieldDef.findUnique({
      where: { entity_key: { entity: dto.entity, key: dto.key } },
    });
    if (exists) throw new ConflictException('Une clé existe déjà pour cette entité.');
    return this.prisma.customFieldDef.create({
      data: {
        entity: dto.entity,
        key: dto.key,
        label: dto.label,
        type: dto.type,
        options: dto.options ?? [],
        required: dto.required ?? false,
      },
    });
  }

  findAll(q: QueryFieldDefDto) {
    return this.prisma.customFieldDef.findMany({
      where: q.entity ? { entity: q.entity } : {},
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: string, dto: UpdateFieldDefDto) {
    await this.getOrThrow(id);
    return this.prisma.customFieldDef.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.prisma.customFieldDef.delete({ where: { id } });
    return { deleted: true };
  }

  private async getOrThrow(id: string) {
    const def = await this.prisma.customFieldDef.findUnique({ where: { id } });
    if (!def) throw new NotFoundException('Définition de champ personnalisé introuvable');
    return def;
  }

  // Bir entity için verilen customFields'i tanımlara göre doğrular + dönüştürür.
  // requireAll=true ise zorunlu alanların varlığı da kontrol edilir (create).
  async validateValues(
    entity: CustomFieldEntity,
    values: Record<string, unknown> | undefined,
    requireAll = false,
  ): Promise<Record<string, unknown>> {
    const defs = await this.prisma.customFieldDef.findMany({
      where: { entity },
    });
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const input = values ?? {};

    // Bilinmeyen anahtar reddi.
    for (const key of Object.keys(input)) {
      if (!byKey.has(key)) {
        throw new BadRequestException(`Tanımsız özel alan: ${key}`);
      }
    }

    const out: Record<string, unknown> = {};
    for (const def of defs) {
      const has = Object.prototype.hasOwnProperty.call(input, def.key);
      if (!has) {
        if (def.required && requireAll) {
          throw new BadRequestException(`Zorunlu özel alan eksik: ${def.key}`);
        }
        continue;
      }
      out[def.key] = this.coerce(def, input[def.key]);
    }
    return out;
  }

  private coerce(def: CustomFieldDef, value: unknown): unknown {
    switch (def.type) {
      case CustomFieldType.NUMBER: {
        const n = Number(value);
        if (Number.isNaN(n)) {
          throw new BadRequestException(`${def.key}: sayı bekleniyor.`);
        }
        return n;
      }
      case CustomFieldType.BOOLEAN: {
        if (typeof value === 'boolean') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        throw new BadRequestException(`${def.key}: boolean bekleniyor.`);
      }
      case CustomFieldType.DATE: {
        const d = new Date(String(value));
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException(
            `${def.key}: geçerli tarih bekleniyor.`,
          );
        }
        return d.toISOString();
      }
      case CustomFieldType.SELECT: {
        if (!def.options.includes(String(value))) {
          throw new BadRequestException(
            `${def.key}: geçersiz seçenek (${def.options.join(', ')}).`,
          );
        }
        return String(value);
      }
      case CustomFieldType.TEXT:
      default:
        return String(value);
    }
  }
}
