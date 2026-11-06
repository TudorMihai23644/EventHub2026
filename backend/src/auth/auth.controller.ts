import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthUser, CurrentUser } from './roles';
import { ClientHeaderGuard, REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from './cookies';
import { IssuedRefresh } from './sessions.service';
import { ROUTES } from '../common/routes';
import { ThrottleScope } from '../common/security';
import { TURNSTILE_CONFIG, Turnstile, TurnstileConfig, TurnstileGuard } from './turnstile';
import { GOOGLE_CONFIG, GoogleConfig } from './google/google-oauth';

type WithRefresh<T> = T & { refresh?: IssuedRefresh };

@Controller(ROUTES.auth.base)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(GOOGLE_CONFIG) private readonly google: GoogleConfig,
    @Inject(TURNSTILE_CONFIG) private readonly turnstile: TurnstileConfig,
  ) {}

  /** Ce metode de autentificare sunt active: frontend-ul nu ține nicio cheie proprie. Cheia Turnstile e publică. */
  @Get(ROUTES.auth.options)
  options() {
    return { google: this.google.enabled, turnstileSiteKey: this.turnstile.siteKey };
  }

  /** Refresh token-ul pleacă doar în cookie-ul httpOnly; în JSON rămân access token-ul și utilizatorul. */
  private respond<T extends object>(res: Response, result: WithRefresh<T>): T {
    const { refresh, ...body } = result;
    if (refresh) setRefreshCookie(res, refresh.raw, refresh.expiresAt);
    return body as T;
  }

  @Post(ROUTES.auth.register)
  @ThrottleScope('register')
  @Turnstile('register')
  @UseGuards(TurnstileGuard)
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.register(dto, req.headers['user-agent']));
  }

  @Post(ROUTES.auth.login)
  @HttpCode(200)
  @ThrottleScope('login')
  @Turnstile('login')
  @UseGuards(TurnstileGuard)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(dto, req.headers['user-agent']));
  }

  /** Access token nou din cookie-ul de refresh (la încărcarea paginii și când access token-ul expiră). */
  @Post(ROUTES.auth.refresh)
  @HttpCode(200)
  @ThrottleScope('refresh')
  @UseGuards(ClientHeaderGuard)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.refreshSession(req.cookies?.[REFRESH_COOKIE], req.headers['user-agent']);
    if (!result) {
      clearRefreshCookie(res);
      throw new UnauthorizedException('Sesiune expirată. Autentifică-te din nou.');
    }
    return this.respond(res, result);
  }

  /** Închide sesiunea acestui dispozitiv. Nu cere access token: poate fi deja expirat. */
  @Post(ROUTES.auth.logout)
  @HttpCode(204)
  @UseGuards(ClientHeaderGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
  }

  /** Închide toate sesiunile contului, de pe toate dispozitivele. */
  @Post(ROUTES.auth.logoutAll)
  @HttpCode(204)
  @UseGuards(ClientHeaderGuard, JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    clearRefreshCookie(res);
  }

  @Get(ROUTES.auth.me)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  // 202 mereu, cu același mesaj: nu dezvăluie dacă adresa are cont.
  @Post(ROUTES.auth.forgotPassword)
  @HttpCode(202)
  @ThrottleScope('forgot')
  @Turnstile('forgot')
  @UseGuards(TurnstileGuard)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post(ROUTES.auth.resetPassword)
  @HttpCode(200)
  @ThrottleScope('reset')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post(ROUTES.auth.verifyEmail)
  @HttpCode(200)
  @ThrottleScope('verify')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Post(ROUTES.auth.resendVerification)
  @HttpCode(202)
  @ThrottleScope('resend')
  @UseGuards(JwtAuthGuard)
  resendVerification(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }
}
