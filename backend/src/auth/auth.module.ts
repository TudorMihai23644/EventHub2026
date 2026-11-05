import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { secret } from '../common/secrets';
import { MailModule } from '../mail/mail.module';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    UsersModule,
    MailModule, // emailurile de confirmare / resetare
    JwtModule.registerAsync({
      global: true, // JwtService disponibil în guard-urile din toate modulele
      useFactory: () => ({
        secret: secret('JWT_SECRET'), // fără valoare implicită: aplicația nu pornește fără el
        signOptions: { expiresIn: 7 * 24 * 3600 },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService],
})
export class AuthModule {}
