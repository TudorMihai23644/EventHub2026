import { Body, Controller, Delete, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccountService } from './account.service';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDto, DeleteAccountDto, UpdateProfileDto } from '../auth/dto/auth.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/roles';
import { ClientHeaderGuard, clearRefreshCookie, setRefreshCookie } from '../auth/cookies';
import { ROUTES } from '../common/routes';
import { ThrottleScope } from '../common/security';

// Profilul utilizatorului autentificat: nume, parolă, ștergerea contului.
@Controller(ROUTES.account.base)
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService, private readonly auth: AuthService) {}

  @Patch()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateName(user.id, dto.name);
  }

  // setează un cookie nou (sesiunea acestui dispozitiv), deci și protecția CSRF a rutelor cu cookie
  @Post(ROUTES.account.password)
  @HttpCode(200)
  @ThrottleScope('account')
  @UseGuards(ClientHeaderGuard)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refresh, ...session } = await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, req.headers['user-agent']);
    setRefreshCookie(res, refresh.raw, refresh.expiresAt);
    return { ...session, message: 'Parola a fost schimbată. Celelalte sesiuni au fost închise.' };
  }

  @Delete()
  @HttpCode(204)
  @ThrottleScope('account')
  @UseGuards(ClientHeaderGuard)
  async deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: Response) {
    await this.account.deleteAccount(user.id, dto.password);
    clearRefreshCookie(res);
  }
}
