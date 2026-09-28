import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Observable, of } from 'rxjs'
import { tap, map, catchError } from 'rxjs/operators'
import { AUTH_SERVICE } from "../constants/services.js";
import { ClientProxy } from "@nestjs/microservices"
import { UserDto } from "../dto/user.dto.js"

/**
 * Guard usado no app `reservations` (`@UseGuards(JWTAuthGuard)` em
 * `reservations.controller.ts`) para proteger rotas HTTP **sem** o app
 * `reservations` conhecer JWT_SECRET nem falar com o Mongo de usuários — ele
 * delega a validação para o microserviço `auth` via TCP.
 *
 * Note que este é um `JWTAuthGuard` DIFERENTE do `apps/auth/src/Guards/jwt-auth.guard.ts`
 * (aquele usa Passport/`AuthGuard('jwt')` e roda dentro do próprio app `auth`).
 * Mesmo nome, papéis distintos — este aqui é o "guard cliente" que fala com o
 * "servidor" auth por RPC.
 *
 * Fluxo:
 * 1. Lê o cookie `Authentication` (o mesmo setado por `AuthService.login`) direto
 *    da request HTTP que chegou em `reservations`.
 * 2. Sem cookie → `false` → Nest responde `403 Forbidden` (guard que retorna
 *    `false`, diferente de lançar exceção, sempre vira 403, não 401).
 * 3. Com cookie → `authClient.send('authenticate', { Authentication: jwt })`:
 *    manda o JWT por TCP para o app `auth` e espera resposta (request/response,
 *    não fire-and-forget — por isso `send`, não `emit`). Quem recebe do outro
 *    lado é o `@MessagePattern('authenticate')` em `auth.controller.ts`.
 * 4. `tap((res) => ...)` roda como *side effect* quando a resposta chega: guarda
 *    o usuário retornado pelo `auth` em algum lugar do `context` para o handler
 *    (e o `@CurrentUser()`) conseguirem ler depois.
 * 5. `map(() => true)` — o valor da resposta em si não é o retorno do guard, só
 *    dispara a autorização (`canActivate` precisa resolver em `boolean`).
 *
 * O `tap` grava o usuário em `context.switchToHttp().getRequest().user` — a
 * mesma request HTTP de onde o guard tirou o cookie no passo 1, e o mesmo
 * lugar de onde `@CurrentUser()` (`current-user.decorator.ts`) depois lê.
 */
@Injectable()
export class JWTAuthGuard implements CanActivate {
    constructor(@Inject(AUTH_SERVICE) private readonly authClient: ClientProxy) { }

    canActivate(
        context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
        const jwt = context.switchToHttp().getRequest().cookies?.Authentication;
        if (!jwt) {
            return false;
        }

        return this.authClient
            .send<UserDto>('authenticate', {
                Authentication: jwt
            })
            .pipe(
                tap((res) => {
                    context.switchToHttp().getRequest().user = res
                }),
                map(() => true),
                catchError(() => of(false))
            )
    }
}