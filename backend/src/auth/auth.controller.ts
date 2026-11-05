import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthUser, CurrentUser } from './roles';
import { ROUTES } from '../common/routes';
import { ThrottleScope } from '../common/security';

@Controller(ROUTES.auth.base)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post(ROUTES.auth.register)
  @ThrottleScope('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post(ROUTES.auth.login)
  @HttpCode(200)
  @ThrottleScope('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // JWT-ul este stateless: serverul confirmă ieșirea, iar clientul șterge token-ul.
  @Post(ROUTES.auth.logout)
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  logout() {
    return;
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
