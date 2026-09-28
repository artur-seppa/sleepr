# Pagamentos — `payments` + Stripe

O app `payments` é o terceiro microserviço do monorepo (além de `auth` e
`reservations`). Diferente dos outros dois, **não tem nenhuma rota HTTP** — só
existe pra receber uma mensagem TCP (`create_charge`) de `reservations` e
repassar a cobrança pro Stripe.

## As peças e o papel de cada uma

| Peça | Arquivo | Papel |
|---|---|---|
| `PAYMENTS_SERVICE` | `libs/common/src/constants/services.ts` | Token de DI (string `'payments'`) — usado tanto no client (`reservations`) quanto seria usado num guard/provider do lado `payments`, para casar provider ↔ injeção. |
| `ClientsModule.registerAsync([{ name: PAYMENTS_SERVICE, ... }])` | `apps/reservations/src/reservations.module.ts` | Cria o provider `ClientProxy` (cliente TCP) sob o token `PAYMENTS_SERVICE`, apontando pro host/porta do app `payments` (`PAYMENTS_HOST`/`PAYMENTS_PORT` do `.env`). |
| `PaymentsModule` | `apps/payments/src/payments.module.ts` | Módulo raiz: `ConfigModule` (valida `PORT`, `STRIPE_SECRET_KEY`, `NOTIFICATIONS_HOST` e `NOTIFICATIONS_PORT` via Joi) + `LoggerModule` + `ClientsModule` (client do `notifications`). Sem `DatabaseModule` — `payments` não tem banco próprio, é *stateless*. |
| `ClientsModule.registerAsync([{ name: NOTIFICATIONS_SERVICE, ... }])` | `apps/payments/src/payments.module.ts` | Neste app, `payments` é também **cliente TCP**: cria o `ClientProxy` que dispara `notify_email` no microserviço `notifications`. Ver [12 — Notificações](./12-notifications-eventos-tcp.md). |
| `app.connectMicroservice({ transport: Transport.TCP, ... })` | `apps/payments/src/main.ts` | Abre o "servidor" TCP que recebe a chamada do client acima. Não há `app.listen(...)` — este app não serve HTTP. |
| `@MessagePattern('create_charge')` | `apps/payments/src/payments.controller.ts` | Handler que recebe a mensagem TCP, extrai o payload com `@Payload()` (equivalente ao `@Body()` do HTTP) e delega pro `PaymentsService`. |
| `PaymentsService.createCharge` | `apps/payments/src/payments.service.ts` | Fala com o SDK do Stripe para cobrar (ver o estado atual abaixo) e, depois, dispara o evento `notify_email` para o `notifications`. |
| `CreateChargeDto` / `CardDto` | `libs/common/src/dto/` | Formato compartilhado do payload — usado tanto por quem monta a cobrança (`reservations`, dentro de `CreateReservationDto.charge`) quanto por quem valida/consome (`payments`). |
| `PaymentsCreateChargeDto` | `apps/payments/src/dto/payments-create-charge.dto.ts` | `CreateChargeDto` + `email`. É o tipo que o handler do `payments` realmente recebe: o `email` é injetado por `reservations` a partir do usuário logado, não vem do cliente HTTP. |

## O fluxo (do HTTP até o Stripe)

```
cliente HTTP                reservations                          payments                    Stripe
------------                ------------                          --------                     ------
POST /reservations
  body: { ..., charge: { card: {...}, amount } }
  │
  ▼
ValidationPipe global
  valida CreateReservationDto
  (aninhado: charge → CreateChargeDto → card → CardDto)
  │
  ▼
ReservationsController.create(dto, user)
  │
  ▼
ReservationsService.create(dto, { email, _id })
  paymentsService: ClientProxy injetado sob PAYMENTS_SERVICE
  paymentsService.send('create_charge', { ...dto.charge, email })  ── TCP ─▶  PaymentsController.createCharge
                                                                        @MessagePattern('create_charge')
                                                                        @Payload() data: PaymentsCreateChargeDto
                                                                        paymentsService.createCharge(data)
                                                                          1. stripe.paymentMethods.create({ type: 'card', card })  ──▶  Stripe
                                                                                                                                     ◀──  PaymentMethod tokenizado (pm_...)
                                                                          2. stripe.paymentIntents.create({
                                                                               payment_method: pm.id,
                                                                               amount: amount * 100,
                                                                               confirm: true,
                                                                               currency: 'usd',
                                                                             })                                                    ──▶  Stripe
                                                                                                                                     ◀──  PaymentIntent confirmado
                                                                          3. notificationService.emit('notify_email', { email, text })  ──▶  notifications
                                                                                                                    (evento; não espera resposta)
                                                                     ◀──── TCP ───  return paymentIntent
  .pipe(map(...)) grava a reserva com invoiceId = paymentIntent.id
```

O passo 3 (e o restante da cadeia `payments` → `notifications`) está em
[12 — Notificações](./12-notifications-eventos-tcp.md).

> **Estado atual do passo 1:** o diagrama mostra o desenho pretendido, mas o
> código de hoje **pula o passo 1**. `PaymentsService.createCharge` usa
> `payment_method: 'pm_card_visa'` (token de teste fixo do Stripe) direto no
> `paymentIntents.create`, e o `card` recebido é desestruturado e ignorado — ver
> o `⚠️ PENDÊNCIA` em `payments.service.ts`. Serve para exercitar o fluxo sem
> número de cartão real; antes de cobrar de verdade, precisa voltar a tokenizar
> o `card` com `paymentMethods.create`.

## Por que dois passos no Stripe (`paymentMethods.create` + `paymentIntents.create`)

Isso é a **Payment Intents API** do Stripe, em duas etapas:

1. **`paymentMethods.create({ type: 'card', card })`** — envia os dados crus do
   cartão (número, validade, cvc) pro Stripe e recebe de volta um
   `PaymentMethod` **tokenizado** (`pm_...`). A partir daqui, o número do
   cartão nunca mais trafega pela nossa API — só o token.
2. **`paymentIntents.create({ payment_method: pm.id, amount, confirm: true, ... })`**
   — cria **e já confirma** a cobrança usando esse token. `confirm: true` evita
   um segundo round-trip separado só pra "confirmar" a intenção de pagamento.

`amount * 100` porque o Stripe trabalha em **centavos** (a menor unidade da
moeda), não em reais/dólares — `amount: 10` no nosso DTO vira `1000` (10.00
na moeda escolhida, aqui fixa em `currency: 'usd'`).

## Por que `CardDto` (e não o tipo do próprio SDK do Stripe)

`CreateChargeDto.card` é tipado como `CardDto` (classe nossa, em
`libs/common/src/dto/card.dto.ts`) e não como
`Stripe.PaymentMethodCreateParams.Card` (o tipo que o SDK do Stripe usa pro
mesmo formato). O tipo do Stripe é só uma **interface** — some em runtime.
`@ValidateNested()` + `@Type(() => CardDto)` (usados tanto em
`CreateChargeDto` quanto em `CreateReservationDto.charge`) precisam de uma
**classe real** pra instanciar e depois validar os campos de dentro
(`class-transformer`/`class-validator` não enxergam uma interface). `CardDto`
é a nossa versão validável do mesmo formato — por isso vive em `libs/common`,
não dentro de `apps/payments`: quem monta o payload (`reservations`) e quem
consome (`payments`) precisam do mesmo contrato.

## Por que `payments` não tem rota HTTP

Igual ao padrão TCP já visto entre `auth` e `reservations`
([08 — Comunicação `auth` ↔ `reservations`](./08-comunicacao-auth-reservations-tcp.md)):
`payments` só precisa responder a **um** chamador interno (`reservations`),
nunca a um navegador ou cliente externo direto. Expor cobrança de cartão numa
rota HTTP pública seria superfície de ataque desnecessária — o contrato TCP
(`'create_charge'` → `PaymentIntent`) já é suficiente, e só quem tem acesso à
rede interna dos containers (`docker-compose.yaml`) consegue chamá-lo.

## Validação do payload TCP em `payments`

`apps/auth/src/main.ts` e `apps/reservations/src/main.ts` registram
`app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`.
`apps/payments/src/main.ts` **não** registra pipe global — mas isso não deixa o
handler sem validação: `PaymentsController.createCharge` tem
`@UsePipes(new ValidationPipe())` **no próprio handler**, então
`PaymentsCreateChargeDto` (`card`, `amount` e `email`, com o `CardDto`
aninhado) é validado antes de chegar no service. Um payload malformado é
rejeitado ali, e não lá dentro do Stripe.

Duas diferenças em relação ao pipe global dos outros apps: o pipe do handler
roda **sem `whitelist` e sem `transform`** — campos extras no payload não são
removidos, e `data` chega como objeto plain (não como instância de
`PaymentsCreateChargeDto`). Se um dia isso incomodar, é só passar as opções em
`new ValidationPipe({ whitelist: true, transform: true })` ou mover o pipe para
o `main.ts`.

(A validação de `CreateReservationDto` — que inclui `charge` — também acontece
do lado `reservations`, no `ValidationPipe` global daquele app. Mas essa só
cobre o que **chega por HTTP**; a do handler é a que protege o `payments` de
qualquer chamador TCP.)
