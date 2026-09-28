# Notificações — `notifications` e eventos TCP (`emit` vs `send`)

O app `notifications` é o quarto microserviço do monorepo (`auth`, `reservations`,
`payments`, `notifications`). Como o `payments`, **não tem rota HTTP** — só
recebe uma mensagem TCP (`notify_email`). A novidade em relação aos anteriores é
o **tipo** da mensagem: aqui é um **evento** (fire-and-forget), não uma chamada
com resposta. E a cadeia agora tem três saltos.

## A cadeia inteira

```
cliente HTTP        reservations              payments                 notifications          Stripe
------------        ------------              --------                 -------------          ------
POST /reservations
  │
  ▼
ReservationsService.create(dto, user)
  send('create_charge', { ...charge, email })  ── TCP ──▶  PaymentsController.createCharge
  (espera a resposta)                                        @MessagePattern('create_charge')
                                                             PaymentsService.createCharge
                                                               paymentIntents.create(...) ─────────────────────────────▶ Stripe
                                                                                          ◀──────────── PaymentIntent
                                                               emit('notify_email', { email, text }) ── TCP ─▶ NotificationsController.notifyEmail
                                                               (não espera nada)                          @EventPattern('notify_email')
                                                                                                          NotificationsService.notifyEmail
                                                             return paymentIntent
                           ◀── TCP ── PaymentIntent
  grava a reserva no Mongo
  (invoiceId = paymentIntent.id)
```

Repare que `payments` é **servidor** de `reservations` e, ao mesmo tempo,
**cliente** de `notifications`. `reservations` não conhece `notifications`: o
único client dele é `AUTH_SERVICE` e `PAYMENTS_SERVICE`. Quem decide avisar o
usuário é o `payments`, porque é lá que se sabe que a cobrança passou.

## As peças e o papel de cada uma

| Peça | Arquivo | Papel |
|---|---|---|
| `NOTIFICATIONS_SERVICE` | `libs/common/src/constants/services.ts` | Token de DI (string `'notifications'`) — casa o provider criado pelo `ClientsModule` com o `@Inject` do `PaymentsService`. |
| `ClientsModule.registerAsync([{ name: NOTIFICATIONS_SERVICE, ... }])` | `apps/payments/src/payments.module.ts` | Cria o `ClientProxy` (cliente TCP) do `payments` apontando para `NOTIFICATIONS_HOST`/`NOTIFICATIONS_PORT`. |
| `NOTIFICATIONS_HOST` / `NOTIFICATIONS_PORT` | `apps/payments/.env` (+ Joi no `PaymentsModule`) | Endereço do `notifications`. Host = nome do serviço no `docker-compose.yaml` (`notifications`); porta = a mesma `PORT` do `.env` do próprio `notifications` (3004). |
| `PaymentsService.createCharge` | `apps/payments/src/payments.service.ts` | Depois de cobrar, dispara `notificationService.emit('notify_email', { email, text })` — o `text` ("Your payment of $X has completed successfully.") é montado aqui. |
| `PaymentsCreateChargeDto` | `apps/payments/src/dto/payments-create-charge.dto.ts` | `CreateChargeDto` (`card` + `amount`) **+ `email`**. O `email` é o destinatário do evento. |
| ajuste no `ReservationsService.create` | `apps/reservations/src/reservations.service.ts` | Passa a mandar `{ ...charge, email }` no `create_charge`, com o `email` tirado do usuário autenticado (`UserDto`). |
| `app.connectMicroservice({ transport: Transport.TCP, ... })` | `apps/notifications/src/main.ts` | Abre o "servidor" TCP na `PORT` (3004). Sem `app.listen(...)`. |
| `@EventPattern('notify_email')` | `apps/notifications/src/notifications.controller.ts` | Handler do evento; valida o `NotifyEmailDto` com `@UsePipes(new ValidationPipe())` e delega ao service com `await` (ver a seção abaixo). |
| `NotificationsService.notifyEmail` | `apps/notifications/src/notifications.service.ts` | Envia o e-mail de verdade: monta o `transporter` do nodemailer (Gmail + OAuth2) no construtor e chama `sendMail`. Ver a seção do envio abaixo. |
| `NotifyEmailDto` | `apps/notifications/src/dto/notify-email.dto.ts` | Formato do payload do evento: `email` (`@IsEmail()`) e `text` (`@IsString()`, o corpo do e-mail). |
| `docker-compose.yaml` | raiz | Novo serviço `notifications` (sem `ports`, porque só é acessado pela rede interna dos containers). |

## `emit` + `@EventPattern` vs `send` + `@MessagePattern`

São dois estilos de mensagem no mesmo transporte TCP:

| | `send` + `@MessagePattern` | `emit` + `@EventPattern` |
|---|---|---|
| Modelo | request/response | fire-and-forget (evento) |
| Quem chama | `client.send(pattern, data)` | `client.emit(pattern, data)` |
| O `return` do handler | é a resposta enviada de volta | **é descartado** — ninguém recebe |
| Chamador espera? | sim (Observable que emite a resposta) | não |
| Se o handler falhar | o erro volta para o chamador | o chamador não fica sabendo |
| Observable do client | *cold*: só dispara quando alguém dá `subscribe` | *hot*: dispara na hora, mesmo sem `subscribe` |
| Onde já usamos | `authenticate` (auth), `create_charge` (payments) | `notify_email` (notifications) |

**Por que evento aqui?** Mandar e-mail é um efeito colateral: a cobrança não
deve esperar o e-mail sair, nem falhar porque o serviço de e-mail está lento ou
fora do ar. Com `send`, `payments` ficaria pendurado esperando uma resposta que
ele nem usa.

**O que se perde em troca:** não há garantia de entrega. TCP puro, sem fila e
sem retry — se `notifications` estiver fora do ar quando o `emit` acontece, o
evento some em silêncio e o usuário simplesmente não recebe o e-mail (a
cobrança já foi feita). Para garantia de entrega, o passo natural seria um
broker com fila (RabbitMQ, Kafka, ...) — mesma discussão de
[09 — Por que microserviços](./09-por-que-microservicos.md).

**Por que o `emit` não precisa de `.subscribe()` mas o `send` precisa:** o
`emit` é *hot* (dispara ao ser chamado). O `send` é *cold* — por isso
`ReservationsService.create` **devolve** o Observable do `send` (com o `pipe`) em
vez de assiná-lo: quem assina é o Nest, ao montar a resposta HTTP do controller.

## Onde o `email` nasce (e por que só o `payments` o conhece como campo próprio)

1. O usuário faz `POST /reservations` com o cookie de autenticação.
2. `JWTAuthGuard` (ver [08](./08-comunicacao-auth-reservations-tcp.md)) descobre
   o usuário via `auth` e o coloca em `request.user`; `@CurrentUser()` o entrega
   ao controller como `UserDto` (`_id`, `email`, `password`).
3. `ReservationsService.create` monta o payload do `create_charge` como
   `{ ...createReservationDto.charge, email }` — o `email` **nunca vem do corpo
   HTTP**, então o cliente não consegue mandar cobrança "em nome" de outro
   e-mail.
4. `payments` recebe isso como `PaymentsCreateChargeDto` (o `CreateChargeDto`
   compartilhado + `email`) e dispara `{ email, text }` no evento `notify_email` (o `text` é montado ali mesmo, com o `amount`).

`email` fica no DTO do `payments` (não em `libs/common/src/dto/create-charge.dto.ts`)
porque o formato compartilhado é o que o **cliente HTTP** manda em `charge`; o
`email` é um acréscimo interno entre `reservations` e `payments`.

## Como o e-mail é enviado de verdade (nodemailer + Gmail OAuth2)

`NotificationsService` usa o **nodemailer**, a biblioteca Node que fala SMTP:

- `nodemailer.createTransport({ service: 'gmail', auth: { type: 'OAuth2', ... } })`
  cria o **transporter** — o "cliente" de envio, já configurado com as
  credenciais. `service: 'gmail'` preenche host/porta do SMTP do Gmail pra gente.
- `transporter.sendMail({ from, to, subject, text })` faz o envio.
  `from` é o próprio `SMTP_USER`: o Gmail só deixa enviar em nome da conta
  autenticada. `to` é o `email` do evento, `text` é o corpo, e o `subject` está
  fixo em `"Sleepr Notifications"`.

**Por que OAuth2 e não usuário + senha:** o Google não aceita mais senha simples
para apps. Com `clientId` + `clientSecret` + `refreshToken`, o nodemailer pede
sozinho um *access token* novo ao Google toda vez que o atual expira — o
*refresh token* é a credencial de longa duração que permite isso sem
intervenção humana.

### Gotcha: o `transporter` tem que nascer dentro do construtor

O primeiro jeito de escrever isso (e o mais natural) dava erro de TypeScript:

```ts
export class NotificationsService {
  constructor(private readonly configService: ConfigService) {}

  // ❌ TS2729: Property 'configService' is used before its initialization
  private readonly transporter = nodemailer.createTransport({
    auth: { user: this.configService.get('SMTP_USER'), ... },
  });
}
```

Field initializers (`= ...` direto na declaração da classe) rodam **antes** do
corpo do construtor — e é dentro do corpo do construtor que o parameter property
`private readonly configService` é atribuído. Ou seja: na hora em que o
`createTransport` roda, `this.configService` ainda não existe. O TS acusa em
compilação; sem ele, seria um bug de runtime silencioso (transporter com todas
as credenciais `undefined`). A correção é só **declarar** o campo e **atribuir
dentro do construtor**:

```ts
private readonly transporter: Transporter;

constructor(private readonly configService: ConfigService) {
  this.transporter = nodemailer.createTransport({ ... this.configService.get(...) ... });
}
```

É o mesmo padrão do `stripe` em `PaymentsService` (ver
[11 — Pagamentos](./11-payments-stripe.md)). O tipo `Transporter` vem de
`import type { Transporter } from 'nodemailer'` — como `nodemailer` é importado
como *default export* (um valor), não dá pra usar `nodemailer.Transporter` como
tipo.

## Por que o controller dá `await` no service

`NotificationsController.notifyEmail` faz `await this.notificationsService.notifyEmail(data)`.
Como o `sendMail` pode rejeitar (credencial recusada, refresh token revogado,
sem rede), sem o `await` essa Promise ficaria solta: o Nest não conseguiria
capturar o erro, e um *unhandled rejection* no Node (≥ 15) **derruba o processo**
inteiro. Com o `await`, a falha cai no tratamento de exceções do Nest (é logada)
e o app segue de pé. O `payments` continua sem saber do erro — é evento (ver a
tabela `emit` vs `send`).

## Configuração: quem precisa saber de quem

- `notifications/.env`: `PORT=3004` (porta do servidor TCP) mais as credenciais
  do Gmail — `SMTP_USER`, `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET` e `GOOGLE_OAUTH_REFRESH_TOKEN`. Todas
  `required()` no Joi do `NotificationsModule` (*fail fast*: sem elas o app nem
  sobe, em vez de só falhar no primeiro e-mail). `notifications` continua sem
  chamar ninguém — só recebe eventos e fala com o Google.
- Essas quatro são **segredos**: o `.env` está no `.gitignore` e no
  `.dockerignore`, e valores reais não devem aparecer em docs, comentários ou
  commits.
- `payments/.env`: `NOTIFICATIONS_HOST=notifications` e `NOTIFICATIONS_PORT=3004`.
  Ambos `required()` no Joi do `PaymentsModule` — sem eles o `payments` nem sobe.
- `NOTIFICATIONS_HOST=notifications` funciona porque, dentro da rede do
  docker-compose, o nome do serviço é resolvido como hostname do container.

## Pendências conhecidas neste trecho

Não foram corrigidas (a do `pm_card_visa` também está sinalizada no código com `⚠️ PENDÊNCIA`):

- **`payments` ignora o cartão.** `PaymentsService.createCharge` usa
  `payment_method: 'pm_card_visa'` (token de teste fixo do Stripe) em vez de
  tokenizar o `card` recebido. Detalhes em
  [11 — Pagamentos](./11-payments-stripe.md).
- **Assunto fixo.** `subject: 'Sleepr Notifications'` está hardcoded no service;
  o `NotifyEmailDto` só carrega `email` e `text`. Se quiser assuntos diferentes
  por tipo de evento, o campo tem que entrar no DTO.
- **O teste gerado do `notifications` está desatualizado.**
  `notifications.controller.spec.ts` (e o e2e) ainda chamam `getHello()` /
  esperam `"Hello World!"` do scaffold do Nest — o controller não tem esse
  método mais, então esse teste não passa.
