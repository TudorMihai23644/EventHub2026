import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { Registration } from '../registrations/registration.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MailModule } from '../mail/mail.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { ImagesModule } from '../images/images.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [TypeOrmModule.forFeature([Event, Registration]), MailModule, WaitlistModule, ImagesModule, PaymentsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService], // AccountModule: ștergerea contului unui organizator
})
export class EventsModule {}
