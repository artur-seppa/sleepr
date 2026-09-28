import { AuthGuard } from '@nestjs/passport';

/**
 * Guard que ativa a Passport strategy registrada com o nome `'local'`
 * (a nossa {@link LocalStrategy}).
 *
 * `AuthGuard('local')` é uma **factory**: ela já devolve uma classe de guard
 * completa, com o `canActivate` que:
 *
 * 1. roda a strategy `'local'` → chama `LocalStrategy.validate(email, password)`;
 * 2. se `validate` devolve um usuário, o Passport anexa em `request.user` e
 *    libera a rota;
 * 3. se `validate` lança / devolve falsy, o guard corta a request com `401` e o
 *    handler do controller nem executa.
 *
 * Por que a classe está "vazia"? Porque todo o comportamento vem da classe base.
 * A gente estende só para:
 *
 * - ter um **nome/tipo próprio** para referenciar em `@UseGuards(LocalAuthGuard)`
 *   em vez de repetir a string mágica `'local'` nos controllers;
 * - ter um **ponto de extensão** — se um dia precisar logar tentativas de login
 *   ou customizar a resposta de erro, é só sobrescrever `handleRequest()` aqui.
 */
export class LocalAuthGuard extends AuthGuard('local') {}
