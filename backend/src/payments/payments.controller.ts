import { Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser, Roles, RolesGuard } from '../auth/roles';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';
import { ROUTES } from '../common/routes';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** „Cumpără bilet” → `{ url }`: browserul merge pe pagina de plată Stripe. */
  @Post(`${ROUTES.events.base}/${ROUTES.events.checkout}`)
  @HttpCode(200)
  @RequireVerifiedEmail('să cumperi bilete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARTICIPANT')
  checkout(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payments.checkout(user.id, id);
  }

  /** Doar Stripe (semnătura e verificată pe corpul brut). Fără limitarea cererilor: Stripe trimite în rafale. */
  @Post(ROUTES.payments.webhook)
  @HttpCode(200)
  @SkipThrottle()
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}
