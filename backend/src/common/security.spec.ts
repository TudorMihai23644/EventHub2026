import { Body, Controller, Get, HttpCode, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { LIMITS, TOO_MANY_REQUESTS, ThrottleScope, swaggerEnabled, throttleScopeOf, throttlerOptions, trustProxySetting } from './security';
import { AuthController } from '../auth/auth.controller';

// Rute de test cu aceleași marcaje ca AuthController, fără bază de date.
@Controller('auth')
class FakeAuthController {
  @Post('login')
  @HttpCode(200)
  @ThrottleScope('login')
  login(@Body() _body: unknown) {
    return { ok: true };
  }

  @Post('register')
  @ThrottleScope('register')
  register() {
    return { ok: true };
  }

  @Get('other')
  other() {
    return { ok: true };
  }
}

describe('Limitarea cererilor', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerOptions)],
      controllers: [FakeAuthController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterEach(() => app.close());

  const login = (email: string) => request(app.getHttpServer()).post('/auth/login').send({ email, password: 'x' });

  it(`permite ${LIMITS.loginAccount.limit} autentificări pe minut pentru același email, apoi 429`, async () => {
    for (let i = 0; i < LIMITS.loginAccount.limit; i++) {
      await login('ana@test.ro').expect(200);
    }
    const res = await login('ANA@test.ro ').expect(429); // același cont, scris altfel
    expect(res.body.message).toBe(TOO_MANY_REQUESTS);
    expect(res.headers['retry-after-login-account']).toBeDefined();
  });

  it('un alt email din aceeași rețea nu este blocat', async () => {
    for (let i = 0; i < LIMITS.loginAccount.limit; i++) await login('ana@test.ro');
    await login('ana@test.ro').expect(429);
    await login('ion@test.ro').expect(200);
  });

  it(`limitează la ${LIMITS.loginIp.limit} autentificări pe minut de pe același IP, pe conturi diferite`, async () => {
    for (let i = 0; i < LIMITS.loginIp.limit; i++) {
      await login(`user${i}@test.ro`).expect(200);
    }
    await login('altcineva@test.ro').expect(429);
  });

  it(`limitează înregistrările la ${LIMITS.register.limit} pe oră`, async () => {
    for (let i = 0; i < LIMITS.register.limit; i++) {
      await request(app.getHttpServer()).post('/auth/register').expect(201);
    }
    await request(app.getHttpServer()).post('/auth/register').expect(429);
  });

  it('limitele stricte nu se aplică celorlalte rute', async () => {
    for (let i = 0; i < LIMITS.register.limit + 5; i++) {
      await request(app.getHttpServer()).get('/auth/other').expect(200);
    }
  });
});

describe('AuthController folosește limitele stricte', () => {
  it('login și register sunt marcate', () => {
    expect(throttleScopeOf(AuthController.prototype.login)).toBe('login');
    expect(throttleScopeOf(AuthController.prototype.register)).toBe('register');
    expect(throttleScopeOf(AuthController.prototype.me)).toBeUndefined();
  });
});

describe('swaggerEnabled', () => {
  it.each([
    [{}, true],
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }, true],
    [{ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }, false],
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: ' TRUE ' }, true],
  ])('%j -> %s', (env, expected) => {
    expect(swaggerEnabled(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe('trustProxySetting', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['false', undefined],
    ['true', true],
    ['1', 1],
    ['loopback', 'loopback'],
  ])('%j -> %j', (value, expected) => {
    expect(trustProxySetting(value)).toBe(expected);
  });
});
