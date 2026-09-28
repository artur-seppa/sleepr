# Comunicação `auth` ↔ `reservations` via TCP

O app `reservations` precisa saber "quem é o usuário logado" em rotas como
`POST /reservations`, mas **não tem** acesso ao `JWT_SECRET` nem ao schema de
usuários — essas coisas pertencem ao app `auth`. A solução: `reservations`
pergunta para `auth` por uma conexão de microserviço (TCP), em vez de validar o
token localmente.

## As peças e o papel de cada uma

| Peça | Arquivo | Papel |
|---|---|---|
| `AUTH_SERVICE` | `libs/common/src/constants/services.ts` | Token de DI (string `'auth'`) — o mesmo nome usado dos dois lados para casar provider ↔ injeção. |
| `ClientsModule.registerAsync([...])` | `apps/reservations/src/reservations.module.ts` | Cria o provider `ClientProxy` (cliente TCP) sob o token `AUTH_SERVICE`, apontando para host/porta do app `auth`. |
| `JWTAuthGuard` (common) | `libs/common/src/auth/jwt-auth.guard.ts` | Guard usado em `reservations`: lê o cookie, chama `auth` via TCP, autentica a rota. |
| `app.connectMicroservice({ transport: Transport.TCP, ... })` | `apps/auth/src/main.ts` | Abre, no app `auth`, o "servidor" TCP que recebe as chamadas do guard acima. |
| `@MessagePattern('authenticate')` + `AuthService.verifyToken` | `apps/auth/src/auth.controller.ts` / `auth.service.ts` | Handler que recebe a mensagem TCP `'authenticate'`, verifica o JWT e devolve o usuário. |
| `UserDto` | `libs/common/src/dto/user.dto.ts` | Formato (plain object) do usuário que trafega no payload de resposta. |

## Por que dois "servidores" no mesmo app `auth`

`apps/auth/src/main.ts` faz duas coisas:

```ts
const app = await NestFactory.create(AuthModule); // servidor HTTP (para POST /auth/login)
app.connectMicroservice({
  transport: Transport.TCP,
  options: { host: '0.0.0.0', port: configService.get('TCP_PORT') },
});
// ...
await app.startAllMicroservices(); // liga o "servidor" TCP
await app.listen(configService.getOrThrow<number>('HTTP_PORT')); // liga o HTTP
```

O mesmo processo Nest escuta em **duas portas**: `HTTP_PORT` para requests
normais de navegador/cliente (`POST /auth/login`), e `TCP_PORT` só para
mensagens vindas de outros microserviços (`@MessagePattern`). `reservations`
nunca bate na porta HTTP do `auth` — só na TCP.

## O fluxo (ida e volta)

```
reservations                                   auth
------------                                   ----
POST /reservations
  cookie: Authentication=<jwt>
  │
  ▼
JWTAuthGuard.canActivate (@app/common)
  1. lê request.cookies.Authentication
  2. sem cookie → false → 403, para aqui
  3. authClient.send('authenticate', { Authentication: jwt })  ──── TCP ───▶  AuthController.authenticate
                                                                                 @MessagePattern('authenticate')
                                                                                 @Payload() data = { Authentication: jwt }
                                                                                 authService.verifyToken(data.Authentication)
                                                                                   jwtService.verify → payload { userId }
                                                                                   usersService.getUser({ _id: userId })
  4. tap((res) => request.user = res)                          ◀──── TCP ───  return <usuário>
  5. map(() => true) → canActivate resolve `true`
  │
  ▼
@CurrentUser() user  (lê request.user, que o guard acabou de popular)
  │
  ▼
ReservationsController.create(dto, user._id)
```

`authClient.send(...)` (não `emit`) porque é uma chamada **request/response**:
o guard precisa esperar a resposta do `auth` antes de decidir se a rota segue.
`send` devolve um `Observable` — por isso o `canActivate` também pode devolver
`Observable<boolean>` (assinatura de `CanActivate` permite `boolean | Promise
| Observable`).

No lado `auth`, `AuthController.authenticate` não usa `JWTAuthGuard`/Passport
(aquele guard espera contexto HTTP — Request/Response do Express — que não
existe numa chamada RPC/TCP). A verificação é feita direto em
`AuthService.verifyToken`: reaproveita o mesmo `JwtService`/`JWT_SECRET` usados
para **assinar** o token em `login`, agora para **verificar**
(`jwtService.verify`), e busca o usuário via `UsersService.getUser`.

## Por que faz sentido essa separação

- `reservations` não precisa saber o que é `JWT_SECRET`, nem importar
  `bcrypt`/schema de usuário — só precisa de um jeito de perguntar "esse cookie
  é válido, e de quem é?".
- Se amanhã trocar a estratégia de auth inteira (outro provedor, outro
  algoritmo de token), só o app `auth` muda — o contrato TCP
  (`'authenticate'` → usuário) continua o mesmo.
- É o mesmo padrão usado por `DatabaseModule`/`LoggerModule` (ver
  [01 — Módulos e DI](./01-modules-e-di.md)): cada app só importa/injeta o que
  precisa, sem acoplar implementação.
