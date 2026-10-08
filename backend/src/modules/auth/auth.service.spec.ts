// src/modules/auth/auth.service.spec.ts
// Faz 1 birim testleri — bağımlılıklar mock'lanır (DB gerekmez).
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';

// bcrypt native modülü; spyOn ile yeniden tanımlanamadığı için tümden mock'lanır.
jest.mock('bcrypt');

type MockRepo = {
  [K in keyof AuthRepository]: jest.Mock;
};

const mockHash = bcrypt.hash as jest.Mock;
const mockCompare = bcrypt.compare as jest.Mock;

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'admin@example.invalid',
  passwordHash: 'hashed',
  firstName: 'System',
  lastName: 'Admin',
  isActive: true,
  roles: [{ role: { name: 'ADMIN' } }],
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;
  let repo: MockRepo;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  const config = {
    get: (key: string, def?: unknown) => {
      const values: Record<string, unknown> = {
        BCRYPT_COST: 12,
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
      };
      return values[key] ?? def;
    },
    getOrThrow: (key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
      };
      return values[key];
    },
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

    repo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createUser: jest.fn(),
      createRefreshToken: jest.fn(),
      findRefreshTokenById: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllForUser: jest.fn(),
    } as unknown as MockRepo;

    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      verifyAsync: jest.fn(),
    };

    service = new AuthService(
      repo as unknown as AuthRepository,
      jwt as unknown as JwtService,
      config,
    );
  });

  // U-1.1
  it("register parolayı bcrypt ile hash'ler ve düz parolayı saklamaz", async () => {
    repo.findByEmail.mockResolvedValue(null);
    mockHash.mockResolvedValue('bcrypted');
    repo.createUser.mockImplementation(
      ({ passwordHash }: { passwordHash: string }) =>
        makeUser({ passwordHash }),
    );

    const result = await service.register({
      email: 'new@crm.dev',
      password: 'S3cure!Pass00',
      firstName: 'New',
      lastName: 'User',
    });

    expect(mockHash).toHaveBeenCalledWith('S3cure!Pass00', 12);
    const created = repo.createUser.mock.calls[0][0];
    expect(created.passwordHash).toBe('bcrypted');
    expect(created.passwordHash).not.toBe('S3cure!Pass00');
    // Yanıtta parola/hash sızmaz
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('password');
  });

  // U-1.2
  it('register mevcut e-posta ile ConflictException atar', async () => {
    repo.findByEmail.mockResolvedValue(makeUser());
    await expect(
      service.register({
        email: 'admin@example.invalid',
        password: 'S3cure!Pass00',
        firstName: 'X',
        lastName: 'Y',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // U-1.3
  it('validateAndLogin yanlış parolada generic UnauthorizedException atar', async () => {
    repo.findByEmail.mockResolvedValue(makeUser());
    mockCompare.mockResolvedValue(false);
    await expect(
      service.validateAndLogin({ email: 'admin@example.invalid', password: 'wrong' }),
    ).rejects.toMatchObject({ message: 'Identifiants invalides' });
  });

  // U-1.3b — enumeration/timing: kullanıcı yoksa da bcrypt.compare çağrılır
  it('validateAndLogin kullanıcı yoksa bile bcrypt.compare çağırır (timing engeli)', async () => {
    repo.findByEmail.mockResolvedValue(null);
    mockCompare.mockResolvedValue(false);
    await expect(
      service.validateAndLogin({ email: 'nope@crm.dev', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockCompare).toHaveBeenCalled();
  });

  // U-1.4
  it('validateAndLogin pasif kullanıcıda UnauthorizedException atar', async () => {
    repo.findByEmail.mockResolvedValue(makeUser({ isActive: false }));
    mockCompare.mockResolvedValue(true);
    await expect(
      service.validateAndLogin({ email: 'admin@example.invalid', password: 'ok' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // U-1.5
  it("login access + refresh üretir, refresh hash DB'ye yazılır, ham token yanıtta yok", async () => {
    repo.findByEmail.mockResolvedValue(makeUser());
    mockCompare.mockResolvedValue(true);
    repo.createRefreshToken.mockResolvedValue({ id: 'rt-1' });
    repo.updateRefreshTokenHash.mockResolvedValue({});

    const result = await service.validateAndLogin({
      email: 'admin@example.invalid',
      password: 'ok',
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(repo.createRefreshToken).toHaveBeenCalledTimes(1);
    // Hash yazıldı ve düz token DEĞİL
    const [, writtenHash] = repo.updateRefreshTokenHash.mock.calls[0];
    expect(writtenHash).toBe(sha256('signed.jwt.token'));
    expect(result.user.roles).toEqual(['ADMIN']);
  });

  // U-1.6
  it('refresh: iptal edilmiş token tekrar kullanılırsa tüm oturumlar iptal edilir', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'rt-1' });
    repo.findRefreshTokenById.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: sha256('old'),
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: new Date(), // zaten iptal
    });

    await expect(service.refresh('old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repo.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('refresh: geçerli token rotasyonla eskiyi iptal eder ve yeni üretir', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'rt-1' });
    repo.findRefreshTokenById.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: sha256('valid'),
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
    });
    repo.findById.mockResolvedValue(makeUser());
    repo.createRefreshToken.mockResolvedValue({ id: 'rt-2' });
    repo.updateRefreshTokenHash.mockResolvedValue({});

    const result = await service.refresh('valid');

    expect(repo.revokeRefreshToken).toHaveBeenCalledWith('rt-1');
    expect(result.accessToken).toBe('signed.jwt.token');
  });

  it('refresh: hash uyuşmazsa (aynı jti farklı token) tüm oturumlar iptal edilir', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'rt-1' });
    repo.findRefreshTokenById.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: sha256('the-real-token'),
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
    });

    await expect(service.refresh('a-different-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repo.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('logout: geçerli token ilgili refresh kaydını iptal eder', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'rt-1' });
    repo.findRefreshTokenById.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      revokedAt: null,
    });
    await service.logout('token');
    expect(repo.revokeRefreshToken).toHaveBeenCalledWith('rt-1');
  });

  it('logout: token yoksa sessizce başarılı (idempotent)', async () => {
    await expect(service.logout(undefined)).resolves.toBeUndefined();
    expect(repo.revokeRefreshToken).not.toHaveBeenCalled();
  });
});
