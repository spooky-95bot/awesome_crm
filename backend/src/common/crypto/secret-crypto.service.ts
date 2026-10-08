// src/common/crypto/secret-crypto.service.ts
// Panelden girilen entegrasyon sırlarını AES-256-GCM ile şifreler/çözer.
// Anahtar: APP_ENCRYPTION_KEY (base64, 32 bayt). Yoksa açık hata (fail-safe; sessizce düz saklamaz).
// Biçim: "v1:" + base64(iv(12) | authTag(16) | ciphertext).
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'v1:';

@Injectable()
export class SecretCryptoService {
  private readonly logger = new Logger(SecretCryptoService.name);

  constructor(private readonly config: ConfigService) {}

  // Şifreleme yapılandırıldı mı? (panel "bağlantı ekleme" için ön koşul)
  isConfigured(): boolean {
    try {
      this.key();
      return true;
    } catch {
      return false;
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key(), iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payload: string): string {
    if (!payload.startsWith(PREFIX)) {
      throw new InternalServerErrorException('Format de mot de passe inconnu.');
    }
    const raw = Buffer.from(payload.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      'utf8',
    );
  }

  // JSON nesnesini şifrele/çöz (birden çok sır alanı için).
  encryptJson(obj: Record<string, unknown>): string {
    return this.encrypt(JSON.stringify(obj));
  }
  decryptJson<T = Record<string, unknown>>(payload: string): T {
    return JSON.parse(this.decrypt(payload)) as T;
  }

  private key(): Buffer {
    const b64 = this.config.get<string>('APP_ENCRYPTION_KEY');
    if (!b64) {
      throw new InternalServerErrorException(
        'APP_ENCRYPTION_KEY tanımlı değil — bağlantı sırları şifrelenemiyor.',
      );
    }
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'APP_ENCRYPTION_KEY 32 bayt (base64) olmalı.',
      );
    }
    return key;
  }
}
