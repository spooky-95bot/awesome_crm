// src/modules/auth/dto/login.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@example.invalid' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cure!Passw0rd' })
  @IsString()
  @MinLength(1)
  password: string;
}
