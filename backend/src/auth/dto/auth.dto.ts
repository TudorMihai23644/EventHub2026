import { applyDecorators } from '@nestjs/common';
import { Trim } from '../../common/trim';
import { IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

// Aceleași reguli la înregistrare și la resetarea parolei (72 = limita bcrypt).
const PasswordRules = () =>
  applyDecorators(
    IsString({ message: 'Parola este obligatorie.' }),
    MinLength(8, { message: 'Parola trebuie să aibă cel puțin 8 caractere.' }),
    MaxLength(72, { message: 'Parola poate avea maximum 72 de caractere.' }),
  );

// Token-ul din link: base64url de 32 de octeți = 43 de caractere; limita doar oprește valori absurde.
const TokenRules = () =>
  applyDecorators(
    IsString({ message: 'Linkul nu este valid.' }),
    MaxLength(200, { message: 'Linkul nu este valid.' }),
  );

export class RegisterDto {
  @IsString({ message: 'Numele este obligatoriu.' })
  @MinLength(2, { message: 'Numele trebuie să aibă cel puțin 2 caractere.' })
  @MaxLength(100, { message: 'Numele poate avea maximum 100 de caractere.' })
  @Trim()
  name: string;

  @IsEmail({}, { message: 'Introdu o adresă de email validă.' })
  email: string;

  @PasswordRules()
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

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Introdu o adresă de email validă.' })
  email: string;
}

export class ResetPasswordDto {
  @TokenRules()
  token: string;

  @PasswordRules()
  password: string;
}

export class UpdateProfileDto {
  @IsString({ message: 'Numele este obligatoriu.' })
  @MinLength(2, { message: 'Numele trebuie să aibă cel puțin 2 caractere.' })
  @MaxLength(100, { message: 'Numele poate avea maximum 100 de caractere.' })
  @Trim()
  name: string;
}

export class ChangePasswordDto {
  @IsString({ message: 'Parola curentă este obligatorie.' })
  @MaxLength(72, { message: 'Parola poate avea maximum 72 de caractere.' })
  currentPassword: string;

  @PasswordRules()
  newPassword: string;
}

export class DeleteAccountDto {
  @IsString({ message: 'Confirmă cu parola contului.' })
  @MaxLength(72, { message: 'Parola poate avea maximum 72 de caractere.' })
  password: string;
}

export class VerifyEmailDto {
  @TokenRules()
  token: string;
}
