import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Stripe } from 'stripe'
import { CreateChargeDto } from '../../../libs/common/src/dto/create-charge.dto.js';
import { NOTIFICATIONS_SERVICE } from '@app/common/constants/services.js';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentsCreateChargeDto } from './dto/payments-create-charge.dto.js';

@Injectable()
export class PaymentsService {
  // Só a DECLARAÇÃO do tipo aqui, sem `= new Stripe(...)`. O client é montado
  // dentro do construtor (abaixo) — ver o comentário lá do porquê.
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    // Cliente TCP do microserviço `notifications` — o provider é criado pelo
    // `ClientsModule.registerAsync` em `payments.module.ts` sob o token
    // `NOTIFICATIONS_SERVICE` (`libs/common/src/constants/services.ts`).
    @Inject(NOTIFICATIONS_SERVICE) private readonly notificationService: ClientProxy
  ) {
    // ⚠️ Isto TEM que ser feito aqui dentro, e não como field initializer
    // (`private readonly stripe = new Stripe(...)` direto na declaração da
    // classe). Field initializers rodam ANTES do corpo do construtor — nesse
    // ponto `this.configService` (que é atribuído pelo parameter property, já
    // dentro do corpo do construtor) ainda não existe. O TS pega isso em tempo
    // de compilação (`TS2729: Property 'configService' is used before its
    // initialization`), mas seria um bug de runtime silencioso sem o TS: o
    // Stripe seria criado com `apiKey = undefined`.
    //
    // `getOrThrow` (em vez de `get`) porque o SDK do Stripe exige `string`
    // (não `string | undefined`) — e como o Joi já valida `STRIPE_SECRET_KEY`
    // como obrigatório no `PaymentsModule`, se chegou até aqui ela existe;
    // `getOrThrow` só documenta essa garantia para o TS.
    this.stripe = new Stripe(
      this.configService.getOrThrow('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2026-08-26.dahlia',
      },
    );
  }

  /**
   * Cobra um cartão usando a Payment Intents API do Stripe.
   *
   * `reservations` chama isto via TCP (`@MessagePattern('create_charge')` em
   * {@link PaymentsController}) — ver `docs/11-payments-stripe.md` para o fluxo
   * completo `reservations` → `payments` → Stripe.
   *
   * Desenho pretendido, em dois passos no Stripe (mais um terceiro, o aviso):
   *
   * 1. `paymentMethods.create({ type: 'card', card })` — envia os dados crus do
   *    cartão (número, validade, cvc — vindos do {@link CreateChargeDto}) para o
   *    Stripe e recebe de volta um `PaymentMethod` **tokenizado** (`pm_...`).
   *    Depois deste passo, o número do cartão nunca mais trafega pela nossa API.
   * 2. `paymentIntents.create({ payment_method, amount, confirm: true, ... })` —
   *    cria E JÁ CONFIRMA a cobrança usando esse token (`confirm: true` evita um
   *    segundo round-trip separado de "confirmar"). `amount * 100` porque o
   *    Stripe trabalha em **centavos** (a menor unidade da moeda), não em reais/
   *    dólares.
   * 3. `notificationService.emit('notify_email', { email, text })` — avisa o
   *    microserviço `notifications` que a cobrança passou (`text` é a mensagem
   *    do e-mail, montada aqui com o `amount`). É um **evento**
   *    (`emit`), não uma chamada (`send`): não espera resposta, e o resultado
   *    do envio do e-mail não muda o retorno desta função. `emit` devolve um
   *    Observable *hot* — a mensagem é disparada mesmo sem `.subscribe()` (o
   *    oposto do `send`, que é *cold* e só dispara quando alguém assina; por
   *    isso `reservations` devolve o `send` para o Nest, que assina).
   *    Se `notifications` estiver fora do ar, o evento se perde em silêncio
   *    (TCP sem fila/retry) — a cobrança já foi feita mesmo assim.
   *    `email` não vem do cliente HTTP: é o e-mail do usuário logado, injetado por
   *    `ReservationsService.create` no payload de `create_charge`.
   *
   * ⚠️ PENDÊNCIA: o passo 1 **não acontece hoje**. O código usa direto
   * `payment_method: 'pm_card_visa'` (token de teste fixo do Stripe), então o
   * `card` recebido é desestruturado e ignorado — qualquer cartão válido no DTO
   * cobra o mesmo "Visa de teste". Serve para testar o fluxo sem número de
   * cartão real, mas precisa voltar para `paymentMethods.create({ type: 'card',
   * card })` antes de virar cobrança de verdade. Ver `docs/11-payments-stripe.md`.
   */
  async createCharge(
    { card, amount, email }: PaymentsCreateChargeDto
  ) {
    const paymentIntent = await this.stripe.paymentIntents.create({
      payment_method: 'pm_card_visa',
      amount: amount * 100,
      confirm: true,
      payment_method_types: ['card'],
      currency: 'usd'
    })

    this.notificationService.emit('notify_email', {
      email,
      text: `Your payment of $${amount} has completed successfully.`
    })

    return paymentIntent;
  }
}
