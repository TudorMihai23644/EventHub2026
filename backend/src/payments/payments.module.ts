import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundWorker } from './refund.worker';
import { HttpStripeClient, STRIPE_CONFIG, StripeClient, StripeConfig, stripeConfig } from './stripe';

// Evenimente cu plată (Stripe Checkout). Oprit fără STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET.
@Module({
  imports: [MailModule],
  controllers: [PaymentsController],
  providers: [
    { provide: STRIPE_CONFIG, useFactory: () => stripeConfig() },
    { provide: StripeClient, useFactory: (cfg: StripeConfig) => new HttpStripeClient(cfg), inject: [STRIPE_CONFIG] },
    PaymentsService,
    RefundWorker,
  ],
  exports: [STRIPE_CONFIG, PaymentsService],
})
export class PaymentsModule {}
