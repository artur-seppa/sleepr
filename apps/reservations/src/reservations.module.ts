import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationRepository } from './reservation.repository.js';
import { ReservationDocument, ReservationSchema } from './models/reservation.schema.js';
import { DatabaseModule } from '@app/common/database/database.module.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from '@app/common/logger/logger.module.js';
import Joi from 'joi';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AUTH_SERVICE, PAYMENTS_SERVICE } from '@app/common/constants/services.js'

/**
 * Módulo raiz da aplicação de reservas.
 *
 * É o módulo entregue ao `NestFactory.create(...)` em `main.ts`; por isso, além
 * de ser o feature module das reservas, concentra a configuração que vale para a
 * aplicação inteira (env, conexão com o banco, logger).
 *
 * Imports:
 *
 * - `ConfigModule.forRoot({ isGlobal, validationSchema })` — lê o `.env` e valida
 *   na inicialização com Joi. Se `MONGODB_URI` faltar, a app não sobe (*fail
 *   fast*). Sendo `isGlobal`, o `ConfigService` fica disponível em toda a app
 *   sem reimportar o módulo.
 *
 * - `DatabaseModule` (importado "pelado") — dispara o `MongooseModule.forRootAsync`
 *   de dentro do {@link DatabaseModule}: **abre e mantém a conexão** com o
 *   MongoDB. Roda uma única vez e, por este ser o módulo raiz, é aqui que a
 *   conexão nasce.
 *
 * - `DatabaseModule.forFeature([{ name, schema }])` — atalho para
 *   `MongooseModule.forFeature(...)`. Registra **o model** deste módulo: cria um
 *   provider `Model<ReservationDocument>` com token igual ao `name`
 *   (`ReservationDocument.name` → `"ReservationDocument"`), **com escopo apenas
 *   neste módulo**. É esse provider que o {@link ReservationRepository} recebe
 *   via `@InjectModel(ReservationDocument.name)`.
 *
 * - `LoggerModule` — logger Pino (configurado em `@app/common/logger`) para logs
 *   de requisição HTTP e de aplicação.
 *
 * Padrão `forRoot` / `forFeature` do `@nestjs/mongoose`: `forRoot*` cuida da
 * **conexão** (uma vez, no módulo raiz); `forFeature` cuida dos **models** (cada
 * feature module declara só os seus — não há lista central). Se outro módulo
 * precisar do mesmo model, chama `forFeature` de novo lá (ou este módulo exporta
 * o provider). Ver `docs/02-mongoose-forroot-vs-forfeature.md`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Cada chave do schema é uma variável de ambiente obrigatória ou opcional.
      // Novas variáveis (PORT, JWT_SECRET, ...) devem ser adicionadas aqui.
      validationSchema: Joi.object({
        MONGODB_URI: Joi.string().required(),
        PORT: Joi.number().port().required(),
        AUTH_HOST: Joi.string().required(),
        PAYMENTS_HOST: Joi.string().required(),
        AUTH_PORT: Joi.number().required(),
        PAYMENTS_PORT: Joi.number().required(),
      }),
    }), // Carrega e valida o .env, e disponibiliza o ConfigService para injeção de dependência
    DatabaseModule,
    DatabaseModule.forFeature([{ name: ReservationDocument.name, schema: ReservationSchema }]),
    LoggerModule, // Captura logs de requisições HTTP e logs de aplicação, usando Pino como logger configurado no common/logger.module.ts
    // `ClientsModule.registerAsync` cria um provider `ClientProxy` injetável sob o
    // token `AUTH_SERVICE` (mesma string usada em `@Inject(AUTH_SERVICE)` no
    // `JWTAuthGuard` — ver `libs/common/src/constants/services.ts`). É esse
    // client que o guard usa para falar por TCP com o app `auth`
    // (`authClient.send('authenticate', ...)`), sem `reservations` precisar
    // importar `AuthModule`, JWT_SECRET ou o schema de usuário.
    // `registerAsync` (em vez de `register`) porque host/porta vêm do
    // `ConfigService`, disponível só depois do bootstrap.
    //
    // Dois clients aqui: `AUTH_SERVICE` (guard) e `PAYMENTS_SERVICE`
    // (`ReservationsService.create` → `send('create_charge', ...)`). Não há
    // client de `notifications` neste módulo — de propósito: quem avisa o
    // usuário é o `payments`, depois de cobrar (cadeia `reservations` →
    // `payments` → `notifications`, ver `docs/12-notifications-eventos-tcp.md`).
    ClientsModule.registerAsync([
      {
        name: AUTH_SERVICE,
        useFactory: (ConfigService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: ConfigService.get('AUTH_HOST'),
            port: ConfigService.get('AUTH_PORT'),
          }
        }),
        inject: [ConfigService]
      },
      {
        name: PAYMENTS_SERVICE,
        useFactory: (ConfigService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: ConfigService.get('PAYMENTS_HOST'),
            port: ConfigService.get('PAYMENTS_PORT'),
          }
        }),
        inject: [ConfigService]
      },
    ])
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationRepository],
})
export class ReservationsModule { }
