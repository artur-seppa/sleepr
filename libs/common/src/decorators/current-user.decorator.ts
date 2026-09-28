import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDto } from '../dto/user.dto.js';

// Só LÊ o `request.user`. Quem GRAVA ali é o guard/Passport, um passo antes:
// `LocalAuthGuard` → `LocalStrategy.validate()` → o Passport pega o retorno do
// `validate()` e coloca em `request.user`. Esta função apenas devolve esse valor.
//
// O `: UserDto` aqui é uma ASSERÇÃO, não uma garantia: `getRequest()` é `any`,
// então o TS só confia. Em runtime `request.user` é exatamente o que o guard
// colocou ali, e isso MUDA conforme o app:
// - em `apps/auth`  → o retorno de `usersService.verifyUser`, um documento real
//   do Mongoose (`UserDocument`, com `_id: Types.ObjectId`);
// - em `reservations` → o JSON que voltou do `auth` pelo TCP (plain object,
//   `_id` string) — daí o `UserDto`.
//
// Por que `UserDto` e não `UserDocument`: o `UserDocument` mora em
// `apps/auth/src/users/models/`, e uma lib compartilhada NÃO pode importar de
// dentro de um app — isso inverte a dependência (`libs/common` → `apps/auth`) e
// faz o build da imagem do `reservations` exigir o código-fonte do `auth` no
// contexto do Docker. O `UserDto` já vive aqui no common e é o formato que de
// fato atravessa a fronteira entre os microserviços.
//
// Este tipo de retorno NÃO limita os call sites: `createParamDecorator` não
// tipa o parâmetro do handler, então cada app continua anotando o que quiser
// (`@CurrentUser() user: UserDocument` no `auth`, `UserDto` no `reservations`).
// Manter guard/strategy ↔ tipo em sincronia continua sendo responsabilidade nossa.
function getCurrentUserByContext(ctx: ExecutionContext): UserDto {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
}

/**
 * Param decorator custom — um **getter** de `request.user`.
 *
 * `@CurrentUser() user: UserDto` no handler é açúcar para `@Req() req` +
 * `req.user`, só que tipado e reutilizável. Ele **não** popula, associa nem
 * "aloca" nada: a associação request ↔ user já foi feita pelo guard.
 *
 * `createParamDecorator(factory)` — o Nest chama a `factory(data, ctx)` na hora
 * de resolver o parâmetro e injeta o retorno. (`data` seria o argumento passado
 * ao decorator, ex. `@CurrentUser('email')`; aqui não é usado.)
 *
 * ⚠️ Só tem valor se **um guard rodou antes** e populou `request.user`
 * (ex. {@link LocalAuthGuard}). Sem guard, vem `undefined`.
 */
export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => getCurrentUserByContext(ctx)
);
