import { Controller, Get, UsePipes, ValidationPipe } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PaymentsCreateChargeDto } from './dto/payments-create-charge.dto.js';

/**
 * Handler TCP (não HTTP) do microserviço de pagamentos.
 *
 * `@MessagePattern('create_charge')` registra este método como o receptor de
 * mensagens TCP com esse nome — quem chama é o `reservations`
 * (`paymentsClient.send('create_charge', createChargeDto)`, client injetado sob
 * o token `PAYMENTS_SERVICE`, ver `reservations.module.ts`). `@Payload()` é o
 * equivalente do `@Body()` do mundo HTTP: extrai o payload da mensagem.
 *
 * `@MessagePattern` (request/response, com `return`) — diferente do
 * `@EventPattern` do `notifications`, que é fire-and-forget. Aqui o `reservations`
 * fica esperando o `PaymentIntent` para gravar o `invoiceId` da reserva.
 *
 * A validação do {@link PaymentsCreateChargeDto} (class-validator: `card`,
 * `amount` e `email`) é feita pelo `@UsePipes(new ValidationPipe())` neste
 * handler — `main.ts` não registra pipe global. Ver `docs/11-payments-stripe.md`.
 */
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @MessagePattern('create_charge')
  @UsePipes(new ValidationPipe())
  async createCharge(@Payload() data: PaymentsCreateChargeDto) {
    return this.paymentsService.createCharge(data)
  }
}
