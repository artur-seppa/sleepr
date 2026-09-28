import { Module } from '@nestjs/common';
import { LoggerModule as pinoLoggerModule } from 'nestjs-pino';

/*
    Config do pino para busca de logs de requisições HTTP e logs de aplicação.
    Foi utilizado como common para ser importado por outros módulos, como o ReservationsModule, e não precisar repetir a configuração do Pino em cada módulo.

    O pino-pretty é um transport que formata os logs para serem mais legíveis no console, com cores e timestamps.
    ⚠️ O pino-pretty é recomendado apenas para desenvolvimento, pois ele diminui a performance do logger. Em produção, é recomendado utilizar o pino sem o pretty, ou enviar os logs para um serviço de log centralizado.
*/
@Module({
    imports: [
        pinoLoggerModule.forRoot({
            pinoHttp: {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname',
                        singleLine: true,
                    },
                },
            },
        })
    ],
})
export class LoggerModule { }
