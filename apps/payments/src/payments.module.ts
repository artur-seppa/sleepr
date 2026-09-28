import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { LoggerModule } from '@app/common/logger/logger.module.js'
import { ClientsModule, Transport } from '@nestjs/microservices';
import {NOTIFICATIONS_SERVICE} from '@app/common/constants/services.js'

/**
 * Módulo raiz da aplicação de pagamentos (`payments`).
 *
 * É o módulo entregue ao `NestFactory.create(...)` em `main.ts`. Diferente de
 * `auth`/`reservations`, este app **não tem NENHUMA rota HTTP** — só expõe um
 * handler TCP (`@MessagePattern('create_charge')` em {@link PaymentsController}),
 * chamado pelo `reservations` (client `PAYMENTS_SERVICE`, ver
 * `docs/11-payments-stripe.md`). Por isso `main.ts` nunca chama `app.listen(...)`,
 * só `app.startAllMicroservices()`.
 *
 * O `payments` é **os dois lados** de uma comunicação TCP: *servidor* de
 * `reservations` (recebe `create_charge`) e *cliente* de `notifications`
 * (dispara `notify_email` depois de cobrar). Cadeia completa:
 * `reservations` → `payments` → `notifications` — ver
 * `docs/12-notifications-eventos-tcp.md`.
 *
 * Imports:
 *
 * - `ConfigModule.forRoot({ isGlobal, validationSchema })` — lê o `.env` e valida
 *   na inicialização com Joi: `PORT`, `STRIPE_SECRET_KEY`, `NOTIFICATIONS_HOST` e
 *   `NOTIFICATIONS_PORT`, todos obrigatórios. Se algum faltar, a app não sobe
 *   (*fail fast*) — é exatamente esse erro que aparecia quando o
 *   `docker-compose.yaml` deste serviço apontava, por engano, para o `.env` do
 *   `auth` (ver `docs/10-docker-compose-monorepo-dist-compartilhado.md`).
 *
 * - `LoggerModule` — logger Pino (configurado em `@app/common/logger`) para logs
 *   de aplicação (não há requisição HTTP para logar aqui).
 *
 * - `ClientsModule.registerAsync([{ name: NOTIFICATIONS_SERVICE, ... }])` — cria o
 *   provider `ClientProxy` (cliente TCP) sob o token `NOTIFICATIONS_SERVICE`,
 *   apontando para o app `notifications` (`NOTIFICATIONS_HOST`/`NOTIFICATIONS_PORT`).
 *   É o mesmo padrão que `reservations.module.ts` usa para `AUTH_SERVICE` e
 *   `PAYMENTS_SERVICE`; `PaymentsService` o recebe via
 *   `@Inject(NOTIFICATIONS_SERVICE)`. `registerAsync` porque host/porta vêm do
 *   `ConfigService`. No docker-compose, `NOTIFICATIONS_HOST=notifications` é o
 *   nome do serviço (o DNS interno do compose resolve para o container).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Cada chave do schema é uma variável de ambiente obrigatória ou opcional.
      // Novas variáveis (PORT, JWT_SECRET, ...) devem ser adicionadas aqui.
      validationSchema: Joi.object({
        PORT: Joi.number().port().required(),
        STRIPE_SECRET_KEY: Joi.string().required(),
        NOTIFICATIONS_HOST: Joi.string().required(),
        NOTIFICATIONS_PORT: Joi.number().required(),
      }),
    }), // Carrega e valida o .env, e disponibiliza o ConfigService para injeção de dependência
    LoggerModule, // Captura logs de requisições HTTP e logs de aplicação, usando Pino como logger configurado no common/logger.module.ts
    ClientsModule.registerAsync([
      {
        name: NOTIFICATIONS_SERVICE,
        useFactory: (ConfigService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: ConfigService.get('NOTIFICATIONS_HOST'),
            port: ConfigService.get('NOTIFICATIONS_PORT')
          }
        }),
        inject: [ConfigService]
      }
    ])
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule { }
