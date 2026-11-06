import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Registration } from './registration.entity';
import { Event } from '../events/event.entity';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { MailModule } from '../mail/mail.module';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [TypeOrmModule.forFeature([Registration, Event]), MailModule, WaitlistModule],
  controllers: [RegistrationsController, CheckinController],
  providers: [RegistrationsService, CheckinService],
  exports: [RegistrationsService], // AccountModule: ștergerea contului anulează înscrierile (cu promovare)
})
export class RegistrationsModule {}
