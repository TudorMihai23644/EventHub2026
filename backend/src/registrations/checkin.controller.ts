import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { CheckinService } from './checkin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser, Roles, RolesGuard } from '../auth/roles';
import { ROUTES } from '../common/routes';

class ScanDto {
  @IsString({ message: 'Codul biletului este obligatoriu.' })
  @MaxLength(40, { message: 'Codul biletului nu este valid.' })
  code: string;
}

class AttendanceDto {
  @IsBoolean({ message: 'Alege prezent sau absent.' })
  present: boolean;
}

// Validarea biletelor la intrare: doar organizatorul evenimentului.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  // QR-ul deschide /check-in/<cod> în browserul organizatorului; pagina trimite codul aici
  @Post(ROUTES.checkin.scan)
  @HttpCode(200)
  scan(@CurrentUser() user: AuthUser, @Body() dto: ScanDto) {
    return this.checkin.scan(user.id, dto.code);
  }

  // marcare manuală din lista de participanți
  @Put(`${ROUTES.events.base}/${ROUTES.events.attendance}`)
  setAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() dto: AttendanceDto,
  ) {
    return this.checkin.setAttendance(user.id, id, registrationId, dto.present);
  }
}
