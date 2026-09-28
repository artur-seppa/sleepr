import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module.js';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);
  // Obtém o ConfigService (nele setamos como é feito as regras das variáveis de ambiente) para acessar variáveis de ambiente.
  const configService = app.get(ConfigService);
  // Abre a conexão de microservico para ter comunicacao com outro microserviço podendo declarar o tipo de comunicacao (podendo ser KAFKA, GRPC, etc)
  // Aqui abrimos um server TCP que vai receber as conexoes de fora (reservations)
  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: configService.get('TCP_PORT')
    }
  })
  // lib para permitir a leitura de cookie na requisicao
  app.use(cookieParser())
  // Pipe de validação para transformar e validar os dados de entrada, retorna antes mesmo de chegar ao controller se houver erro nesta camada.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Configura o logger Pino para capturar logs de requisições HTTP e logs de aplicação.
  app.useLogger(app.get(Logger));

  await app.startAllMicroservices(); // liga o "servidor" TCP
  await app.listen(configService.getOrThrow<number>('HTTP_PORT')); // liga o HTTP
}
await bootstrap();
