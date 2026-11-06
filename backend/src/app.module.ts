import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { throttlerOptions } from './common/security';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { RemindersModule } from './reminders/reminders.module';
import { AccountModule } from './account/account.module';
import { GeoModule } from './geo/geo.module';
import { PaymentsModule } from './payments/payments.module';
import { dataSourceOptions } from './database/data-source';

@Module({
  controllers: [HealthController],
  // limitarea cererilor se aplică global, pe toate rutele (vezi common/security.ts)
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // erorile neprevăzute (500) ajung la Sentry, dacă e configurat; răspunsurile HTTP rămân cele obișnuite ale Nest
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
  imports: [
    SentryModule.forRoot(),
    ThrottlerModule.forRoot(throttlerOptions),
    ScheduleModule.forRoot(), // OutboxWorker (trimiterea emailurilor din coadă)
    // Schema se creează și se modifică doar prin migrări, rulate la pornire (vezi database/data-source.ts).
    TypeOrmModule.forRootAsync({ useFactory: () => dataSourceOptions() }),
    UsersModule,
    AuthModule,
    EventsModule,
    RegistrationsModule,
    RemindersModule, // memento cu o zi înainte de eveniment
    AccountModule, // profil: nume, parolă, ștergerea contului
    GeoModule, // locația pe hartă (Nominatim, în fundal)
    PaymentsModule, // bilete cu plată (Stripe), doar cu cheile configurate
  ],
})
export class AppModule {}
