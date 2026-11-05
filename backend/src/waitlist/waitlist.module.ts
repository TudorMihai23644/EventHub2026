import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

// Folosit de RegistrationsModule (anulare → promovare) și EventsModule (capacitate mărită → promovare, afișare).
@Module({
  imports: [MailModule],
  controllers: [WaitlistController],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
