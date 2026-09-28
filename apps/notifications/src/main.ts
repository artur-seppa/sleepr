import { NestFactory } from '@nestjs/core';
import { NotificationsModule } from './notifications.module.js';
import { Transport } from '@nestjs/microservices'
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

/**
 * Bootstrap do microserviço de notificações (`notifications`).
 *
 * Mesmo desenho do `payments`: **sem HTTP** — só um "servidor" TCP
 * (`connectMicroservice` + `startAllMicroservices`), nunca `app.listen(...)`.
 * Quem bate nessa porta é o `payments` (não o `reservations`): depois de cobrar
 * o cartão, ele dispara o evento `notify_email` (ver `payments.service.ts`).
 * Cadeia completa: `reservations` → `payments` → `notifications` — ver
 * `docs/12-notifications-eventos-tcp.md`.
 */
async function bootstrap() {
  const app = await NestFactory.create(NotificationsModule);
  // Obtém o ConfigService (nele setamos como é feito as regras das variáveis de ambiente) para acessar variáveis de ambiente.
  const configService = app.get(ConfigService);
  // Abre a conexão de microservico para ter comunicacao com outro microserviço podendo declarar o tipo de comunicacao (podendo ser KAFKA, GRPC, etc)
  // Aqui abrimos um server TCP que vai receber as conexoes de fora (payments,
  // via o client `NOTIFICATIONS_SERVICE` registrado em `payments.module.ts`).
  // `PORT` (3004) precisa bater com `NOTIFICATIONS_PORT` no `.env` do payments.
  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: configService.get('PORT')
    }
  })

  // Configura o logger Pino para capturar logs de requisições HTTP e logs de aplicação.
  app.useLogger(app.get(Logger));

  // liga o "servidor" TCP
  await app.startAllMicroservices(); 
}
await bootstrap();
