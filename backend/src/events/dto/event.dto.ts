import { Trim } from '../../common/trim';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateEventDto {
  @IsString({ message: 'Titlul este obligatoriu.' })
  @MinLength(3, { message: 'Titlul trebuie să aibă cel puțin 3 caractere.' })
  @MaxLength(120, { message: 'Titlul poate avea maximum 120 de caractere.' })
  @Trim()
  title: string;

  @IsString({ message: 'Descrierea este obligatorie.' })
  @MinLength(10, { message: 'Descrierea trebuie să aibă cel puțin 10 caractere.' })
  @MaxLength(5000, { message: 'Descrierea poate avea maximum 5000 de caractere.' })
  @Trim()
  description: string;

  @IsISO8601({}, { message: 'Data și ora nu sunt valide.' })
  startsAt: string;

  @IsString({ message: 'Locația este obligatorie.' })
  @MinLength(2, { message: 'Locația trebuie să aibă cel puțin 2 caractere.' })
  @MaxLength(160, { message: 'Locația poate avea maximum 160 de caractere.' })
  @Trim()
  location: string;

  @IsDefined({ message: 'Capacitatea este obligatorie.' }) // câmpul gol din formular ajunge ca null
  @IsInt({ message: 'Capacitatea trebuie să fie un număr întreg.' })
  @Min(1, { message: 'Capacitatea minimă este 1 loc.' })
  @Max(100000, { message: 'Capacitatea maximă este 100.000 de locuri.' })
  capacity: number;
}

// La editare, un câmp lipsă rămâne neschimbat, dar `null` este validat (implicit PartialType l-ar lăsa să treacă,
// iar `capacity: null` ar ajunge în baza de date și ar da eroare 500).
export class UpdateEventDto extends PartialType(CreateEventDto, { skipNullProperties: false }) {}

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

export class ListEventsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Căutarea poate avea maximum 100 de caractere.' })
  search?: string;

  // Parametrii din URL sosesc ca text; @Type îi transformă în numere înainte de validare.
  // Pentru „abc” se afișează „trebuie să fie un număr întreg”, nu „minimul este 1” (vezi common/validation.ts).
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'Pagina minimă este 1.' })
  @IsInt({ message: 'Pagina trebuie să fie un număr întreg.' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Max(PAGE_SIZE_MAX, { message: `Limita maximă este ${PAGE_SIZE_MAX} de evenimente pe pagină.` })
  @Min(1, { message: 'Limita minimă este 1.' })
  @IsInt({ message: 'Limita trebuie să fie un număr întreg.' })
  limit: number = PAGE_SIZE_DEFAULT;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(['true', 'false'])
  available?: 'true' | 'false';
}
