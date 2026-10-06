// src/modules/auth/dto/register.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'owner@example.invalid' })
  @IsEmail()
  email: string;

  // En az 10 karakter; küçük+büyük harf, rakam ve özel karakter.
  @ApiProperty({ example: 'S3cure!Passw0rd', minLength: 10 })
  @IsString()
  @MinLength(10)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message:
      'Parola yeterince güçlü değil (büyük/küçük harf, rakam, özel karakter).',
  })
  password: string;

  @ApiProperty({ example: 'System' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Admin' })
  @IsString()
  @MinLength(1)
  lastName: string;
}
