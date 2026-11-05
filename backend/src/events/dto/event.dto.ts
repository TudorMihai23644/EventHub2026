import { Trim } from '../../common/trim';
import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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

  @IsInt({ message: 'Capacitatea trebuie să fie un număr întreg.' })
  @Min(1, { message: 'Capacitatea minimă este 1 loc.' })
  @Max(100000, { message: 'Capacitatea maximă este 100.000 de locuri.' })
  capacity: number;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class ListEventsQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(['true', 'false'])
  available?: 'true' | 'false';
}
