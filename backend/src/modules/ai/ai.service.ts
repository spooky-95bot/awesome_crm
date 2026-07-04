// src/modules/ai/ai.service.ts
// İŞ MANTIĞI: Claude (Anthropic) tabanlı yardımcılar. API anahtarı OPSİYONEL —
// yoksa tüm uç noktalar 503 döner (uygulama yine de açılır). Model çıktısı
// structured output (output_config.format) ile JSON şemaya zorlanır.
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AI_CLIENT } from './ai.client';
import { DealsService } from '../deals/deals.service';
import { DraftEmailDto, SummarizeDto } from './dto/ai.dto';

// Varsayılan model (skill: claude-opus-4-8). AI_MODEL ile ezilebilir.
const DEFAULT_MODEL = 'claude-opus-4-8';

export interface DealScore {
  score: number;
  label: 'DÜŞÜK' | 'ORTA' | 'YÜKSEK';
  rationale: string;
  nextSteps: string[];
}
export interface EmailDraft {
  subject: string;
  body: string;
}
export interface Summary {
  summary: string;
  highlights: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model: string;

  constructor(
    @Inject(AI_CLIENT) private readonly client: Anthropic | null,
    private readonly config: ConfigService,
    private readonly deals: DealsService,
  ) {
    this.model = this.config.get<string>('AI_MODEL') || DEFAULT_MODEL;
  }

  // Panelin AI özelliklerini gösterip göstermeyeceğine karar vermesi için.
  status() {
    return { enabled: this.client !== null, model: this.model };
  }

  // Bir deal'i puanlar (0-100) ve sonraki adımları önerir.
  async scoreDeal(id: string): Promise<DealScore> {
    const deal = await this.deals.findOne(id);
    const facts = JSON.stringify({
      title: deal.title,
      company: deal.company,
      value: deal.value,
      currency: deal.currency,
      status: deal.status,
      customFields: deal.customFields,
      activities: (deal.activities ?? []).map((a) => ({
        type: a.type,
        createdAt: a.createdAt,
      })),
    });
    return this.completeJson<DealScore>(
      'Sen deneyimli bir B2B satış analistisin. Bir fırsatı (deal) verilen ' +
        'gerçeklere göre değerlendir. score 0-100 arası bir tamsayı olmalı ' +
        '(kapanma olasılığı). Türkçe ve öz yanıt ver.',
      `Fırsat verisi:\n${facts}`,
      {
        type: 'object',
        properties: {
          score: { type: 'integer' },
          label: { type: 'string', enum: ['DÜŞÜK', 'ORTA', 'YÜKSEK'] },
          rationale: { type: 'string' },
          nextSteps: { type: 'array', items: { type: 'string' } },
        },
        required: ['score', 'label', 'rationale', 'nextSteps'],
        additionalProperties: false,
      },
    );
  }

  // Verilen bağlama göre takip e-postası taslağı üretir.
  async draftEmail(dto: DraftEmailDto): Promise<EmailDraft> {
    const tone = dto.tone ?? 'professional';
    const language = dto.language ?? 'tr';
    return this.completeJson<EmailDraft>(
      `Sen bir satış temsilcisisin. Net, kısa ve ${tone} tonda bir e-posta ` +
        `taslağı yaz. Dil: ${language}. Yer tutucuları [köşeli parantez] ile belirt.`,
      `Bağlam: ${dto.context}`,
      {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['subject', 'body'],
        additionalProperties: false,
      },
    );
  }

  // Serbest metni (notlar, görüşme dökümü) özetler.
  async summarize(dto: SummarizeDto): Promise<Summary> {
    return this.completeJson<Summary>(
      'Verilen metni öz ve maddeli biçimde özetle. Türkçe yanıt ver. ' +
        'highlights en fazla 5 kısa madde içersin.',
      dto.text,
      {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          highlights: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary', 'highlights'],
        additionalProperties: false,
      },
    );
  }

  // Genel yapısal çıktı — diğer modüller (ör. Marka Radarı niş zenginleştirme) kullanır.
  // AI yoksa ServiceUnavailableException (503) fırlatır; çağıran taraf fallback uygular.
  completeStructured<T>(
    system: string,
    user: string,
    schema: Record<string, unknown>,
    maxTokens = 1024,
  ): Promise<T> {
    return this.completeJson<T>(system, user, schema, maxTokens);
  }

  // --- Yardımcılar ---

  private requireClient(): Anthropic {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI özelliği yapılandırılmamış (ANTHROPIC_API_KEY eksik).',
      );
    }
    return this.client;
  }

  // Modeli çağırır ve çıktıyı JSON şemaya zorlar (structured outputs).
  private async completeJson<T>(
    system: string,
    user: string,
    schema: Record<string, unknown>,
    maxTokens = 1024,
  ): Promise<T> {
    const client = this.requireClient();
    try {
      const res = await client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: {
          format: { type: 'json_schema', schema },
        },
      } as Anthropic.MessageCreateParamsNonStreaming);

      if (res.stop_reason === 'refusal') {
        throw new ServiceUnavailableException(
          'AI isteği güvenlik nedeniyle reddedildi.',
        );
      }
      const text = res.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') {
        throw new Error('AI yanıtı boş döndü.');
      }
      return JSON.parse(text.text) as T;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(
        `AI çağrısı başarısız: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('AI servisi şu an kullanılamıyor.');
    }
  }
}
