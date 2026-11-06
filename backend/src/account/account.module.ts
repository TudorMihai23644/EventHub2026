import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { ImagesModule } from '../images/images.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [AuthModule, EventsModule, RegistrationsModule, ImagesModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
