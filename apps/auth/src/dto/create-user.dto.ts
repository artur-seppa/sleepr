import { IsEmail, IsStrongPassword, IsNotEmpty, IsString } from "class-validator";

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsStrongPassword()
    password: string;
}