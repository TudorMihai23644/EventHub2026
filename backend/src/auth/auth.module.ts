import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { secret } from '../common/secrets';
import { MailModule } from '../mail/mail.module';
import { TokensService } from './tokens.service';
import { SessionsService } from './sessions.service';
import { accessTokenTtl } from './session-policy';

@Module({
  imports: [
    UsersModule,
    MailModule, // emailurile de confirmare / resetare
    JwtModule.registerAsync({
      global: true, // JwtService disponibil în guard-urile din toate modulele
      useFactory: () => ({
        secret: secret('JWT_SECRET'), // fără valoare implicită: aplicația nu pornește fără el
        // 15 minute; sesiunea continuă prin refresh token-ul din cookie (vezi sessions.service.ts)
        signOptions: { expiresIn: accessTokenTtl() },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, SessionsService],
  exports: [AuthService], // AccountModule: schimbarea parolei emite o sesiune nouă
})
export class AuthModule {}
