import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { DatabaseModule } from '@app/common/database/database.module.js';
import { LoggerModule } from '@app/common/logger/logger.module.js';
import { UserDocument, UsersSchema } from './models/users.schema.js';
import { UsersRepository } from './users.repository.js';
import { PassportModule } from '@nestjs/passport';

/**
 * Módulo da feature de usuários.
 *
 * Sobre o import `DatabaseModule.forFeature([...])`:
 *
 * O Nest (via `@nestjs/mongoose`) separa duas responsabilidades pelo padrão
 * `forRoot` / `forFeature`:
 *
 * - `forRootAsync` — abre e mantém **a conexão** com o MongoDB. Roda uma única
 *   vez, no módulo raiz, e vale para a aplicação inteira. É o que o
 *   {@link DatabaseModule} (importado "pelado") faz por dentro.
 * - `forFeature` — registra **os schemas/models** que *este* módulo usa. Não há
 *   uma lista central de todos os schemas do app: cada feature module declara só
 *   os seus.
 *
 * `DatabaseModule.forFeature(models)` é só um atalho para
 * `MongooseModule.forFeature(models)`. Para cada `{ name, schema }` ele cria um
 * provider do `Model<...>` do Mongoose, com o token igual ao `name`
 * (`UserDocument.name` → `"UserDocument"`), **com escopo apenas
 * neste módulo**. É esse provider que o {@link UsersRepository} recebe via
 * `@InjectModel(UserDocument.name)`.
 *
 * Se outro módulo precisasse do mesmo model, teria que chamar `forFeature` de
 * novo lá (ou este módulo exportar o provider).
 *
 * Este módulo importa o `DatabaseModule` "pelado" **e** o `.forFeature(...)`:
 * como o `AuthModule` (raiz) não importa o `DatabaseModule`, é por aqui que a
 * conexão (`forRootAsync`) do app de auth é estabelecida. O `ConfigService` de
 * que o `forRootAsync` depende é global (registrado no `AuthModule` via
 * `ConfigModule.forRoot({ isGlobal: true })`), por isso não é importado aqui.
 * Ver `docs/02-mongoose-forroot-vs-forfeature.md`.
 */
@Module({
  imports: [
    DatabaseModule,
    DatabaseModule.forFeature([{ name: UserDocument.name, schema: UsersSchema }]),
    LoggerModule, // Captura logs de requisições HTTP e logs de aplicação, usando Pino como logger configurado no common/logger.module.ts
    // ⚠️ Necessário aqui: JWTAuthGuard (usado no UsersController) é o
    // AuthGuard('jwt') do @nestjs/passport, que injeta AuthModuleOptions
    // opcionalmente. O PassportModule "pelado" (sem .register()) não provê
    // nada — é só uma @Module({}) vazia; AuthModuleOptions só existe quando
    // se chama .register(...)/.registerAsync(...), que registra o provider.
    // Sem isso, em nenhum módulo da app, o bootstrap quebra com
    // UnknownDependenciesException.
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService], // Exporta o service para que o AuthModule possa utilizar o local strategy (que depende do UsersService para validar credenciais)
})
export class UsersModule {}
