import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { RemindersService } from './reminders.service';

// Memento-ul de cu o zi înainte de eveniment (job programat, emailuri prin coada din MailModule).
@Module({
  imports: [MailModule],
  providers: [RemindersService],
})
export class RemindersModule {}
