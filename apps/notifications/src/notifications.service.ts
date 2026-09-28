import { Injectable } from '@nestjs/common';
import { NotifyEmailDto } from './dto/notify-email.dto.js';
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { ConfigService } from '@nestjs/config';

/**
 * Envia e-mails de verdade, via Gmail (SMTP) com autenticação OAuth2.
 *
 * O `nodemailer` é a biblioteca que fala SMTP; o `transporter` é o "cliente"
 * dele, já configurado com as credenciais. Como o Google não aceita mais só
 * usuário+senha para apps, usamos OAuth2: com `clientId` + `clientSecret` +
 * `refreshToken` o nodemailer pede sozinho um *access token* novo ao Google
 * sempre que o anterior expira. As quatro variáveis (`SMTP_USER` e as três
 * `GOOGLE_OAUTH_*`) são validadas no Joi do `NotificationsModule`.
 *
 * Ver `docs/12-notifications-eventos-tcp.md`.
 */
@Injectable()
export class NotificationsService {
  // Só a DECLARAÇÃO do tipo aqui, sem `= nodemailer.createTransport(...)`. O
  // transporter é montado dentro do construtor (abaixo) — mesmo motivo do
  // `stripe` em `payments.service.ts`.
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    // ⚠️ Isto TEM que ser feito aqui dentro, e não como field initializer
    // (`private readonly transporter = nodemailer.createTransport({ ... })`
    // direto na declaração da classe). Field initializers rodam ANTES do corpo do
    // construtor — nesse ponto `this.configService` (atribuído pelo parameter
    // property, já dentro do corpo do construtor) ainda não existe. O TS acusa
    // isso em tempo de compilação (`TS2729: Property 'configService' is used
    // before its initialization`), e sem o TS seria um bug de runtime: o
    // transporter nasceria com todas as credenciais `undefined`.
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: this.configService.get('SMTP_USER'),
        clientId: this.configService.get('GOOGLE_OAUTH_CLIENT_ID'),
        clientSecret: this.configService.get('GOOGLE_OAUTH_CLIENT_SECRET'),
        refreshToken: this.configService.get('GOOGLE_OAUTH_REFRESH_TOKEN'),
      },
    });
  }

  /**
   * Trata o evento `notify_email` (chamado por {@link NotificationsController}):
   * envia um e-mail para `email` com o corpo `text`.
   *
   * `from` é o próprio `SMTP_USER` (o Gmail só deixa enviar em nome da conta
   * autenticada). O assunto está fixo em "Sleepr Notifications" — `NotifyEmailDto`
   * só carrega `email` e `text`.
   *
   * Devolve uma Promise: se o Gmail recusar (credencial inválida, refresh token
   * revogado, ...) ela **rejeita** — por isso o controller faz `await` dela, para
   * o erro não virar *unhandled rejection*.
   */
  async notifyEmail({ email, text }: NotifyEmailDto) {
    await this.transporter.sendMail({
      from: this.configService.get('SMTP_USER'),
      to: email,
      subject: 'Sleepr Notifications',
      text: text,
    });
  }
}
