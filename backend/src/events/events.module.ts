import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { Registration } from '../registrations/registration.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, Registration])],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
