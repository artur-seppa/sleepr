import { NestFactory } from '@nestjs/core';
import { PaymentsModule } from './payments.module.js';
import { Transport } from '@nestjs/microservices'
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(PaymentsModule);
  // Obtém o ConfigService (nele setamos como é feito as regras das variáveis de ambiente) para acessar variáveis de ambiente.
  const configService = app.get(ConfigService);
  // Abre a conexão de microservico para ter comunicacao com outro microserviço podendo declarar o tipo de comunicacao (podendo ser KAFKA, GRPC, etc)
  // Aqui abrimos um server TCP que vai receber as conexoes de fora (reservations)
  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: configService.get('PORT')
    }
  })

  // Configura o logger Pino para capturar logs de requisições HTTP e logs de aplicação.
  app.useLogger(app.get(Logger));

  // Não há `app.useGlobalPipes(...)` aqui (diferente de `auth`/`reservations`):
  // a validação do payload TCP é feita por handler, com
  // `@UsePipes(new ValidationPipe())` em `PaymentsController.createCharge`.
  // Diferença prática: esse pipe local roda SEM `whitelist`/`transform`, então
  // campos extras não são removidos e o `data` não vira instância da classe.
  // Ver `docs/11-payments-stripe.md`.
  await app.startAllMicroservices(); // liga o "servidor" TCP
}
await bootstrap();
