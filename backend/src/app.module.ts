import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { throttlerOptions } from './common/security';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { secret } from './common/secrets';

@Module({
  controllers: [HealthController],
  // limitarea cererilor se aplică global, pe toate rutele (vezi common/security.ts)
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  imports: [
    ThrottlerModule.forRoot(throttlerOptions),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER ?? 'eventhub',
        password: secret('DB_PASSWORD'),
        database: process.env.DB_NAME ?? 'eventhub',
        autoLoadEntities: true,
        synchronize: true, // pentru proba tehnică; în producție se folosesc migrări
      }),
    }),
    UsersModule,
    AuthModule,
    EventsModule,
    RegistrationsModule,
  ],
})
export class AppModule {}
