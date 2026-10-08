// src/modules/ai/ai.service.spec.ts
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Anthropic from '@anthropic-ai/sdk';
import { AiService } from './ai.service';
import { DealsService } from '../deals/deals.service';

const config = {
  get: jest.fn().mockReturnValue(undefined), // AI_MODEL yok → varsayılan model
} as unknown as ConfigService;

const dealView = {
  id: 'd-1',
  title: 'Büyük Anlaşma',
  company: 'Acme',
  value: '50000',
  currency: 'EUR',
  status: 'OPEN',
  customFields: {},
  activities: [{ type: 'CALL', createdAt: new Date() }],
};

const deals = {
  findOne: jest.fn().mockResolvedValue(dealView),
} as unknown as DealsService;

const aiText = (obj: unknown) =>
  ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(obj) }],
  }) as unknown as Anthropic.Message;

describe('AiService', () => {
  describe('anahtar yokken (client=null)', () => {
    const service = new AiService(null, config, deals);

    it('status enabled=false döner', () => {
      expect(service.status().enabled).toBe(false);
    });

    it('scoreDeal 503 (ServiceUnavailable) fırlatır', async () => {
      await expect(service.scoreDeal('d-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('summarize 503 fırlatır', async () => {
      await expect(
        service.summarize({ text: 'lorem ipsum' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('anahtar varken (mock client)', () => {
    let create: jest.Mock;
    let service: AiService;

    beforeEach(() => {
      create = jest.fn();
      const client = { messages: { create } } as unknown as Anthropic;
      service = new AiService(client, config, deals);
    });

    it('status enabled=true ve model döner', () => {
      const s = service.status();
      expect(s.enabled).toBe(true);
      expect(s.model).toBe('claude-opus-4-8');
    });

    it('scoreDeal: model JSON çıktısını ayrıştırır', async () => {
      create.mockResolvedValue(
        aiText({
          score: 82,
          label: 'YÜKSEK',
          rationale: 'Aktif görüşme var',
          nextSteps: ['Teklif gönder'],
        }),
      );
      const res = await service.scoreDeal('d-1');
      expect(res.score).toBe(82);
      expect(res.label).toBe('YÜKSEK');
      expect(deals.findOne).toHaveBeenCalledWith('d-1');
      // structured output param gönderildi mi?
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-8',
          output_config: expect.objectContaining({
            format: expect.objectContaining({ type: 'json_schema' }),
          }),
        }),
      );
    });

    it('draftEmail: subject/body döner', async () => {
      create.mockResolvedValue(
        aiText({ subject: 'Takip', body: 'Merhaba [isim]' }),
      );
      const res = await service.draftEmail({ context: 'fiyat teklifi takibi' });
      expect(res.subject).toBe('Takip');
      expect(res.body).toContain('[isim]');
    });

    it('model refusal verirse 503 fırlatır', async () => {
      create.mockResolvedValue({
        stop_reason: 'refusal',
        content: [],
      } as unknown as Anthropic.Message);
      await expect(service.summarize({ text: 'x' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('SDK hata fırlatırsa 503 sarmalar', async () => {
      create.mockRejectedValue(new Error('network'));
      await expect(service.summarize({ text: 'x' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
