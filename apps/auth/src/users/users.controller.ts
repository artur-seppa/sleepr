import { Body, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto.js';
import { UsersService } from './users.service.js';
import { JWTAuthGuard } from '../Guards/jwt-auth.guard.js';
import { CurrentUser } from '../../../../libs/common/src/decorators/current-user.decorator.js';
import { UserDocument } from './models/users.schema.js';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Post()
    async createUser(@Body() createUserDto: CreateUserDto) {
        return this.usersService.create(createUserDto);
    }

    /**
     * `GET /users` — "quem sou eu": devolve o usuário logado a partir do cookie
     * `Authentication`, sem precisar mandar email/senha de novo.
     *
     * 1. `@UseGuards(JWTAuthGuard)` — dispara a strategy `'jwt'`
     *    ({@link JwtStrategy}): lê o cookie `Authentication`, verifica assinatura
     *    e expiração do token com `JWT_SECRET`, e busca o usuário completo pelo
     *    `userId` do payload. O que a strategy retorna, o Passport grava em
     *    `request.user`. Se o token faltar/for inválido/expirou, o guard corta
     *    com `401` e o método abaixo nunca roda.
     *    (A ordem de `@Get()` e `@UseGuards()` aqui não importa — cada decorator
     *    escreve numa metadata diferente do mesmo método.)
     *
     * 2. `@CurrentUser() user` — só LÊ o `request.user` que o guard populou no
     *    passo 1 ({@link CurrentUser}).
     *
     * 3. `return user` — aqui, diferente do `AuthController.login`, não tem
     *    `@Res()` no handler, então o Nest volta ao comportamento padrão: pega o
     *    `return` e serializa como corpo da resposta (`200 OK` com o usuário em
     *    JSON).
     */
    @Get()
    @UseGuards(JWTAuthGuard)
    async GetUser(@CurrentUser() user: UserDocument) {
        return user;
    }
}
