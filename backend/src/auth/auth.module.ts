import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { secret } from '../common/secrets';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true, // JwtService disponibil în guard-urile din toate modulele
      useFactory: () => ({
        secret: secret('JWT_SECRET'), // fără valoare implicită: aplicația nu pornește fără el
        signOptions: { expiresIn: 7 * 24 * 3600 },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
