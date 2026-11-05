import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { Registration } from '../registrations/registration.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MailModule } from '../mail/mail.module';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [TypeOrmModule.forFeature([Event, Registration]), MailModule, WaitlistModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
