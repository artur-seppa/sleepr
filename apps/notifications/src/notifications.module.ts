import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { LoggerModule } from '@app/common/logger/logger.module.js'

/**
 * Módulo raiz da aplicação de notificações (`notifications`).
 *
 * É o módulo entregue ao `NestFactory.create(...)` em `main.ts`. Como o
 * `payments`, **não tem rota HTTP** — só um handler TCP de evento
 * (`@EventPattern('notify_email')` em {@link NotificationsController}).
 *
 * É o módulo mais enxuto do monorepo, porque é só um **receptor**: não tem
 * banco (sem `DatabaseModule`) e não chama ninguém (sem `ClientsModule`) —
 * quem tem o client é o `payments`, que aponta para este app. Por isso só há
 * dois imports:
 *
 * - `ConfigModule.forRoot({ isGlobal, validationSchema })` — lê o `.env` e valida
 *   na inicialização com Joi; todas obrigatórias (*fail fast*: se faltar uma, a
 *   app nem sobe, em vez de falhar só no primeiro e-mail):
 *   - `PORT` — porta do servidor TCP (deve casar com `NOTIFICATIONS_PORT` no
 *     `.env` do `payments`);
 *   - `SMTP_USER` — a conta Gmail que envia (usada como `user` e como `from`);
 *   - `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` /
 *     `GOOGLE_OAUTH_REFRESH_TOKEN` — credenciais OAuth2 do Google que o
 *     `NotificationsService` entrega ao nodemailer. **São segredos**: não vão
 *     para o git nem para os docs.
 *
 * - `LoggerModule` — logger Pino (`@app/common/logger`) para logs de aplicação.
 *
 * Ver `docs/12-notifications-eventos-tcp.md`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Cada chave do schema é uma variável de ambiente obrigatória ou opcional.
      // Novas variáveis (PORT, JWT_SECRET, ...) devem ser adicionadas aqui.
      validationSchema: Joi.object({
        PORT: Joi.number().port().required(),
        GOOGLE_OAUTH_CLIENT_ID: Joi.string().required(),
        GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().required(),
        GOOGLE_OAUTH_REFRESH_TOKEN: Joi.string().required(),
        SMTP_USER: Joi.string().required(),
      }),
    }), // Carrega e valida o .env, e disponibiliza o ConfigService para injeção de dependência
    LoggerModule, // Captura logs de requisições HTTP e logs de aplicação, usando Pino como logger configurado no common/logger.module.ts
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule { }
