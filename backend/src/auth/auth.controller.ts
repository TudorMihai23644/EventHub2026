import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthUser, CurrentUser } from './roles';
import { UsersService } from '../users/users.service';
import { ROUTES } from '../common/routes';
import { ThrottleScope } from '../common/security';

@Controller(ROUTES.auth.base)
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  @Post(ROUTES.auth.register)
  @ThrottleScope('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post(ROUTES.auth.login)
  @HttpCode(200)
  @ThrottleScope('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // JWT-ul este stateless: serverul confirmă ieșirea, iar clientul șterge token-ul.
  @Post(ROUTES.auth.logout)
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  logout() {
    return;
  }

  @Get(ROUTES.auth.me)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.id);
  }
}
