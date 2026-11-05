import { Trim } from '../../common/trim';
import { IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString({ message: 'Numele este obligatoriu.' })
  @MinLength(2, { message: 'Numele trebuie să aibă cel puțin 2 caractere.' })
  @MaxLength(100, { message: 'Numele poate avea maximum 100 de caractere.' })
  @Trim()
  name: string;

  @IsEmail({}, { message: 'Introdu o adresă de email validă.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Parola trebuie să aibă cel puțin 8 caractere.' })
  @MaxLength(72, { message: 'Parola poate avea maximum 72 de caractere.' })
  password: string;

  @IsIn(['PARTICIPANT', 'ORGANIZER'], { message: 'Rolul trebuie să fie Participant sau Organizator.' })
  role: 'PARTICIPANT' | 'ORGANIZER';

  // necesar doar pentru ORGANIZER
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Trim()
  inviteCode?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Introdu o adresă de email validă.' })
  email: string;

  @IsString({ message: 'Parola este obligatorie.' })
  password: string;
}
