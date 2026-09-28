# Autenticação — Passport, Guards, Strategies e o `@CurrentUser`

Duas strategies Passport trabalham juntas neste projeto:

- **`local`** — `POST /auth/login` valida email/senha e devolve o cookie
  `Authentication` (JWT).
- **`jwt`** — qualquer rota protegida (ex. `GET /users`) valida esse cookie sem
  pedir email/senha de novo.

Todas as peças ficam em `apps/auth/src/`.

## As peças e o papel de cada uma

| Peça | Arquivo | Papel |
|---|---|---|
| `LocalStrategy` | `strategies/local.strategy.ts` | **Regra de validação do login.** Recebe `email`/`password` e decide se é válido (busca usuário + `bcrypt.compare`). |
| `LocalAuthGuard` | `Guards/local-auth.guards.ts` | **Gatilho.** Liga a strategy `'local'` a uma rota via `@UseGuards(...)`. Barra com `401` se a strategy recusar. |
| `JwtStrategy` | `strategies/jwt.strategy.ts` | **Regra de validação de rota protegida.** Lê o cookie `Authentication`, verifica o JWT e recarrega o usuário do banco. |
| `JWTAuthGuard` | `Guards/jwt-auth.guard.ts` | **Gatilho.** Liga a strategy `'jwt'` a uma rota via `@UseGuards(...)`. |
| `@CurrentUser()` | `current-user.decorator.ts` | **Açúcar de leitura.** Entrega `request.user` (o que a strategy devolveu) já tipado no parâmetro do handler. Serve para as duas strategies. |
| `@Res({ passthrough: true })` | (decorator do Nest) | Injeta o `Response` do Express **sem** o Nest sair da frente, para o service anexar o cookie. |
| `AuthService.login` | `auth.service.ts` | Assina o JWT e faz `response.cookie('Authentication', ...)`. |

## Onde o guard entra no fluxo de uma request

```
request HTTP → roteamento → GUARD (roda a strategy) → param decorators (@CurrentUser) → handler → service
```

O guard roda **antes** do método do controller. Se a strategy recusar, o guard
lança `401 Unauthorized` e o handler **nem executa** (mesma ideia do
`ValidationPipe`, ver [Validação](./03-validation-pipe-e-dtos.md), só que a
barreira agora é autenticação, não formato de payload).

## 1. `LocalStrategy` — a regra

```ts
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) { // Strategy = passport-local
  constructor(private usersService: UsersService) {
    super({ usernameField: 'email' }); // padrão do passport-local é 'username'
  }

  async validate(email: string, password: string) {
    try {
      return await this.usersService.verifyUser(email, password); // → vira request.user
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
  }
}
```

- **`PassportStrategy(Strategy)`** é um *mixin*. Quando o Nest instancia esta
  classe, ela se **registra no Passport com o nome `'local'`** (o nome vem do
  próprio pacote `passport-local`). É esse nome que o guard procura.
- **O que instancia a classe?** Estar em `providers: [LocalStrategy]` no
  `AuthModule` + o `@Injectable()`. Sem isso, a strategy nunca é registrada e o
  guard falha com *"Unknown authentication strategy 'local'"*.
- **`super({ usernameField: 'email' })`** — diz ao `passport-local` para extrair
  o identificador do campo `email` do body em vez de `username`.
- **`validate(email, password)`** — callback que o `passport-local` chama com as
  credenciais já extraídas. O **retorno** vira `request.user`. Lançar exceção =
  login recusado.

## 2. `LocalAuthGuard` — o gatilho (e por que está "vazio")

```ts
export class LocalAuthGuard extends AuthGuard('local') {}
```

- **`AuthGuard('local')`** é uma **factory** do `@nestjs/passport`: já devolve
  uma classe de guard **completa**, com o `canActivate` que roda a strategy
  `'local'`, anexa `request.user` em caso de sucesso, ou corta com `401`.
- A subclasse não adiciona nada de comportamento. Estende só para:
  - ter um **tipo/nome** para usar em `@UseGuards(LocalAuthGuard)` em vez de
    espalhar a string `'local'` pelos controllers;
  - servir de **ponto de extensão** — sobrescrever `handleRequest()` no futuro
    para logar tentativas de login ou customizar o erro.
- Uso na rota:

  ```ts
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@CurrentUser() user: UserDocument, ...) { ... }
  ```

## 3. `@CurrentUser()` — o param decorator custom

```ts
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
```

- **`createParamDecorator(factory)`** — o Nest chama a `factory(data, ctx)` na
  hora de resolver aquele parâmetro e injeta o retorno.
  - `ctx` é o `ExecutionContext`; `ctx.switchToHttp().getRequest()` pega o
    `Request` cru do Express.
  - `data` seria o argumento passado ao decorator (`@CurrentUser('email')`) —
    aqui não é usado.
- `@CurrentUser() user: UserDocument` é equivalente a `@Req() req` + `req.user`,
  só que **tipado e reutilizável**.

### Dois mal-entendidos comuns

- **O decorator não grava/associa nada.** Ele é só um **getter** de
  `request.user`. Quem escreve `request.user` é o Passport, ao rodar o guard:
  ele pega o **retorno do `LocalStrategy.validate()`** e coloca lá (passo 5 do
  fluxo). O decorator só entra depois, no passo 6, e lê. Sem `@UseGuards(...)`
  antes, ninguém escreveu `request.user` → o decorator devolve `undefined`.

- **`request.user` não "tem que ser" `UserDocument`.** Em runtime ele é
  *exatamente* o que a strategy retornou. O `: UserDocument` (no tipo de retorno
  de `getCurrentUserByContext` e no parâmetro do handler) é uma **asserção não
  verificada**: `getRequest()` devolve `any`, então o TS só acredita. Se a
  strategy passar a retornar `{ id, email }`, o `request.user` vira isso e o
  tipo fica mentindo **sem erro de compilação**. Manter `validate()` ↔ tipo em
  sincronia é responsabilidade de quem escreve o código.

## 4. `@Res({ passthrough: true })` — o objeto de resposta

```ts
async login(
  @CurrentUser() user: UserDocument,
  @Res({ passthrough: true }) response: Response, // Response do 'express'
) {
  await this.authService.login(user, response); // response.cookie('jwt', ...)
  response.send(user);
}
```

- Por padrão o Nest monta a resposta a partir do **`return`** do handler.
- No instante em que você injeta **`@Res()`**, o Nest **sai da frente**: assume
  que você vai enviar a resposta na mão (`response.json()` / `.send()`) e
  **ignora o `return`**. Esquecer de enviar = request pendurada.
- **`passthrough: true`** desliga esse "sair da frente": o Nest continua
  cuidando do envio (pelo `return`), e você pega o `response` só para **mexer em
  cookie/header**.
- É necessário aqui porque `AuthService.login` faz:

  ```ts
  response.cookie('jwt', token, { httpOnly: true, expires });
  ```

  e para setar cookie precisa do `Response` real do Express.
- Neste handler ainda se chama `response.send(user)` explicitamente — funciona
  com ou sem `passthrough`; o `passthrough` é o que garante que setar o cookie
  não quebre o resto do fluxo do Nest.
- O nome do cookie (`'Authentication'`) **precisa ser idêntico** ao que o
  `JwtStrategy` vai ler depois — ver seção 5.

### O import de `Response` e o erro do TS

```ts
import type { Response } from 'express';
```

`Response` do Express é uma **interface** (tipo puro, não existe em runtime).
Com **`isolatedModules`** (cada arquivo transpila isolado, sem consultar os
outros) o compilador precisa saber, só pelo `import`, se aquilo some na
compilação; e com **`emitDecoratorMetadata`** o TS tentaria emitir o tipo do
parâmetro como **valor** na metadata do `@Res()`. Os dois juntos → o TS 5 exige
`import type` para deixar explícito que é só tipo. É seguro porque o `@Res()`
funciona pelo decorator, não pela metadata refletida.

## 5. `JwtStrategy` — validar rota protegida pelo cookie

```ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) { // Strategy = passport-jwt
  constructor(configService: ConfigService, private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.Authentication,
      ]),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate({ userId }: TokenPayload) {
    return this.usersService.getUser({ _id: userId }); // → vira request.user
  }
}
```

Mesma ideia da `LocalStrategy` (registra no Passport com o nome `'jwt'`, o
`validate` alimenta `request.user`), mas a "credencial" agora é o cookie, não
body:

- **`jwtFromRequest`** — diz **de onde tirar o token** na request. `ExtractJwt`
  vem com extractors prontos (`fromAuthHeaderAsBearerToken()`, etc.); aqui é
  usado um **extractor custom**: uma função que lê `request.cookies.Authentication`.
  - ⚠️ **Precisa ser o mesmo nome do cookie setado no login**
    (`response.cookie('Authentication', token, ...)` em `AuthService.login`).
    Se os nomes divergirem (ex. um usa `'jwt'` e o outro `'Authentication'`),
    o extractor sempre devolve `undefined` — o guard barra com `401` **mesmo com
    login válido**, e o TS não acusa nada porque para ele são só strings
    iguais/incompatíveis, não uma referência ao mesmo valor.
- **`secretOrKey`** — o mesmo `JWT_SECRET` usado para **assinar** o token
  (`JwtModule` no `AuthModule`). O `passport-jwt` usa isso para **verificar
  assinatura + expiração automaticamente**, antes de chamar `validate()`. Essa é
  a "verificação do JWT" de fato — não é código nosso, é o pacote.
  - Precisa ser `configService.getOrThrow(...)` (não `.get(...)`): o tipo de
    `secretOrKey` é `string`, e `.get()` devolve `string | undefined` — o TS
    recusa passar um `undefined` possível onde é exigido `string`.
- **`validate({ userId })`** — só roda se o token já passou na verificação
  acima. O `payload` é o conteúdo assinado em `AuthService.login`
  (`{ userId }`, ver `interfaces/token-payload.interface.ts`). Aqui buscamos o
  usuário completo no banco — o payload do JWT carrega só o id, não o
  documento inteiro.

## 6. `JWTAuthGuard`

```ts
export class JWTAuthGuard extends AuthGuard('jwt') {}
```

Mesmíssimo papel do `LocalAuthGuard` (seção 2), só que ligando a rota à
strategy `'jwt'` em vez de `'local'`. Protege rotas que exigem **já estar
logado**, lendo o cookie em vez de pedir credenciais nova.

## 7. Rota protegida — `GET /users` (`users.controller.ts`)

```ts
@Get()
@UseGuards(JWTAuthGuard)
async GetUser(@CurrentUser() user: UserDocument) {
  return user;
}
```

- `@UseGuards(JWTAuthGuard)` roda a `JwtStrategy` **antes** do handler: lê
  cookie → verifica JWT → recarrega usuário → grava em `request.user`.
  (A ordem entre `@Get()` e `@UseGuards()` aqui não importa — são metadados
  independentes no mesmo método.)
- `@CurrentUser() user` só lê o `request.user` que o guard acabou de popular.
- **Sem `@Res()` neste handler** — diferente do `login`, aqui o Nest volta ao
  comportamento padrão: o `return user` vira o corpo da resposta (`200 OK` +
  JSON), o Nest cuida de tudo.

Essa rota é o "quem sou eu": o cliente manda o cookie que já tem (o browser faz
isso sozinho) e recebe de volta o usuário logado, sem repetir email/senha.

## Fluxo completo — login + rota protegida

```
POST /auth/login
1. Body { email, password } chega
2. LocalAuthGuard.canActivate → strategy 'local'
3.   LocalStrategy.validate(email, password)
4.     usersService.verifyUser → findOne({ email }) + bcrypt.compare
5.   ok → Passport grava request.user = (retorno do validate)   │ falha → 401, para aqui
6. @CurrentUser() só LÊ request.user → parâmetro `user`
7. handler: authService.login(user, response)
8.   assina JWT (JwtService) + response.cookie('Authentication', token, { httpOnly, expires })
9. response.send(user) → corpo com o usuário, header Set-Cookie: Authentication=...

GET /users  (requests seguintes, browser manda o cookie sozinho)
1. JWTAuthGuard.canActivate → strategy 'jwt'
2.   extrai token de request.cookies.Authentication
3.   passport-jwt verifica assinatura + expiração com JWT_SECRET   │ inválido/ausente → 401, para aqui
4.   JwtStrategy.validate({ userId }) → usersService.getUser({ _id: userId })
5.   ok → Passport grava request.user = (retorno do validate)
6. @CurrentUser() lê request.user → parâmetro `user`
7. handler: return user → 200 OK com o usuário em JSON
```

## Checklist para uma strategy nova funcionar

1. Classe estende `PassportStrategy(<Strategy do pacote>)` e tem `@Injectable()`.
2. Está em `providers: []` do módulo (`AuthModule`).
3. Existe um `AuthGuard('<nome>')` correspondente usado em `@UseGuards(...)`.
4. `validate(...)` retorna o objeto que você quer em `request.user`.
5. Se a credencial vem de um cookie/header custom, **o nome usado para setar e
   para ler tem que ser idêntico** — TS não protege contra esse tipo de
   divergência, só teste manual (ou um teste e2e) pega.
