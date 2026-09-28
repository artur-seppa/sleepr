import { NestFactory } from '@nestjs/core';
import { ReservationsModule } from './reservations.module.js';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(ReservationsModule);
  // lib para permitir a leitura de cookie na requisicao
  app.use(cookieParser())
  //Pipe de validação para transformar e validar os dados de entrada, retorna antes mesmo de chegar ao controller se houver erro nesta camada.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Configura o logger Pino para capturar logs de requisições HTTP e logs de aplicação.
  app.useLogger(app.get(Logger));
  // Obtém o ConfigService (nele setamos como é feito as chamadas das variáveis de ambiente) para acessar variáveis de ambiente e configura a porta do servidor.
  const configService = app.get(ConfigService);
  await app.listen(configService.getOrThrow<number>('PORT'));
}
await bootstrap();
