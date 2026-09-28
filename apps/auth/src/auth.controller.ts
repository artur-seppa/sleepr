import { Controller, Post, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CurrentUser } from '../../../libs/common/src/decorators/current-user.decorator.js';
import { UserDocument } from './users/models/users.schema.js';
// `Response` é só um tipo (interface do Express). Com `isolatedModules` +
// `emitDecoratorMetadata` ligados, o TS 5 exige `import type` para não tentar
// emitir esse tipo como valor em runtime na metadata do decorator `@Res()`.
// (O Nest não usa o tipo refletido de `@Res()` — quem trabalha é o decorator.)
import type { Response } from 'express';
import { LocalAuthGuard } from './Guards/local-auth.guards.js';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * `POST /auth/login` — troca email + senha por um cookie `jwt` httpOnly.
   *
   * Ordem de execução da request:
   *
   * 1. `@UseGuards(LocalAuthGuard)` — dispara a Passport strategy `'local'`
   *    ({@link LocalStrategy}). Ela lê `email`/`password` do body, chama
   *    `usersService.verifyUser` (busca por email + `bcrypt.compare`) e, se a
   *    senha bater, devolve o usuário. **É o Passport que grava esse retorno em
   *    `request.user`** — a associação request ↔ user acontece aqui, no guard.
   *    Se falhar, o guard responde `401` e este método **nunca roda**.
   *
   * 2. `@CurrentUser() user` — param decorator custom ({@link CurrentUser}). Ele
   *    apenas **lê** `request.user` (não grava nada); é o mesmo usuário do passo
   *    1. O tipo `UserDocument` é uma asserção nossa, não algo que o Nest
   *    verifique. Sem um guard antes, viria `undefined`.
   *
   * 3. `@Res({ passthrough: true }) response` — injeta o objeto `Response` cru do
   *    Express. Assim que se injeta `@Res()`, o Nest normalmente "sai da frente"
   *    e passa a esperar que VOCÊ mande a resposta (ignorando o `return`).
   *    `passthrough: true` mantém o Nest cuidando do envio; a gente pega o
   *    `response` só para **mexer no cookie/header**. É necessário aqui porque
   *    `authService.login` chama `response.cookie('jwt', token, { httpOnly:
   *    true, expires })`, e para isso precisa do Response real.
   *
   * 4. `response.send(user)` — devolve o usuário no corpo (o cookie `jwt` já foi
   *    anexado no header pelo service).
   */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @CurrentUser() user: UserDocument,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.login(user, response);
    response.send(user);
  }

  /**
   * Handler TCP (não HTTP) chamado pelo `authClient.send('authenticate', ...)`
   * do guard em `libs/common/src/auth/jwt-auth.guard.ts` — é a "outra ponta" da
   * comunicação entre os microserviços `reservations` e `auth`.
   *
   * `@MessagePattern('authenticate')` (em vez de `@Post(...)`/`@Get(...)`) regista
   * este método como o receptor de mensagens TCP com esse padrão/nome — quem lê o
   * payload é `@Payload()`, equivalente ao `@Body()` do mundo HTTP.
   *
   * Não usa `JWTAuthGuard`/Passport aqui: aquele guard espera contexto **HTTP**
   * (`switchToHttp()` sobre um Request/Response reais do Express), e esta
   * chamada chega por **RPC** (TCP) — não existe cookie nem Response nesse
   * contexto. Por isso a verificação é feita direto em `AuthService.verifyToken`,
   * que reaproveita o mesmo `JwtService`/`JWT_SECRET` usados para assinar o
   * token em `login`, só que para **verificar** (`jwtService.verify`).
   */
  @MessagePattern('authenticate')
  async authenticate(@Payload() data: { Authentication: string }) {
    return this.authService.verifyToken(data.Authentication);
  }
}
