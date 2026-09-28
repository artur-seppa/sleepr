import { Controller, Get, UsePipes, ValidationPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotifyEmailDto } from './dto/notify-email.dto.js';

/**
 * Handler TCP (não HTTP) do microserviço de notificações.
 *
 * `@EventPattern('notify_email')` registra este método como receptor de
 * **eventos** TCP com esse nome — quem dispara é o `payments`
 * (`notificationService.emit('notify_email', { email })`, client injetado sob o
 * token `NOTIFICATIONS_SERVICE`, ver `payments.module.ts`).
 *
 * `@EventPattern` vs `@MessagePattern` (usado em `auth` e `payments`):
 *
 * - `@MessagePattern` = request/response. Quem chama usa `client.send(...)` e
 *   ESPERA a resposta; o `return` do handler é essa resposta.
 * - `@EventPattern` = fire-and-forget. Quem chama usa `client.emit(...)` e não
 *   espera nada; **o `return` do handler é descartado** e o chamador nem fica
 *   sabendo se deu certo. Serve para "avisar que algo aconteceu" (aqui: mandar
 *   um e-mail) sem travar o fluxo principal — a cobrança não deve esperar o
 *   e-mail sair.
 *
 * Por isso este handler não dá `return` do resultado do service: não há
 * ninguém do outro lado para receber o valor.
 *
 * O handler dá `await` no service: como agora o envio de e-mail pode falhar de
 * verdade (Gmail recusar a credencial, refresh token revogado, sem rede), o
 * `await` faz a rejeição cair no tratamento de exceções do Nest (é logada) em
 * vez de virar *unhandled rejection* — que no Node (≥ 15) derrubaria o processo
 * do `notifications`. O `payments` continua sem saber do erro, por ser evento.
 *
 * `@UsePipes(new ValidationPipe())` roda o class-validator do
 * {@link NotifyEmailDto} **só neste handler** — este app não registra pipe global
 * em `main.ts`. Payload inválido (ex.: `email` malformado) faz o handler falhar
 * aqui dentro, mas como é evento, o `payments` não recebe erro nenhum.
 *
 * Ver `docs/12-notifications-eventos-tcp.md`.
 */
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UsePipes(new ValidationPipe())
  @EventPattern('notify_email')
  async notifyEmail(@Payload() data: NotifyEmailDto){
    await this.notificationsService.notifyEmail(data);
  }
}
