import { randomBytes } from 'crypto';
import { envValidationSchema } from './env.validation';

describe('CRM production secret validation', () => {
  const validBase = {
    NODE_ENV: 'production',
    DATABASE_URL: `postgresql://crm:${randomBytes(24).toString('hex')}@db:5432/crm`,
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
    JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
    SEED_ADMIN_EMAIL: 'owner@example.org',
    SEED_ADMIN_PASSWORD: randomBytes(32).toString('base64url'),
    APP_PUBLIC_URL: 'https://crm.example.org',
    APP_PANEL_URL: 'https://crm.example.org',
    COOKIE_SECURE: true,
    CORS_ORIGINS: 'https://elysence-premiere.pages.dev',
  };

  it('rejects known placeholder values for JWT signing secrets', () => {
    const result = envValidationSchema.validate({
      ...validBase,
      JWT_ACCESS_SECRET: `change-me-${'x'.repeat(40)}`,
      JWT_REFRESH_SECRET: `example-${'y'.repeat(40)}`,
    });
    expect(result.error).toBeDefined();
  });

  it('rejects missing or example-only administrator bootstrap credentials', () => {
    const missing = envValidationSchema.validate({
      ...validBase,
      SEED_ADMIN_EMAIL: undefined,
      SEED_ADMIN_PASSWORD: undefined,
    });
    expect(missing.error).toBeDefined();

    const placeholder = envValidationSchema.validate({
      ...validBase,
      SEED_ADMIN_EMAIL: 'admin@example.invalid',
      SEED_ADMIN_PASSWORD: `example-${'z'.repeat(32)}`,
    });
    expect(placeholder.error).toBeDefined();
  });

  it('rejects insecure HTTP panel origins and cookies in production', () => {
    const result = envValidationSchema.validate({
      ...validBase,
      APP_PUBLIC_URL: 'http://crm.example.org',
      APP_PANEL_URL: 'http://crm.example.org',
      COOKIE_SECURE: false,
    });
    expect(result.error).toBeDefined();
  });

  it('accepts distinct strong secrets and an explicitly supplied admin credential', () => {
    const result = envValidationSchema.validate({
      ...validBase,
      SEED_ADMIN_EMAIL: 'owner@example.org',
      SEED_ADMIN_PASSWORD: randomBytes(32).toString('base64url'),
    });
    expect(result.error).toBeUndefined();
  });
});
