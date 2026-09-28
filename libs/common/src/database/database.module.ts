import { Module } from '@nestjs/common';
import { MongooseModule, ModelDefinition } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

/**
 * Módulo de banco de dados: abre e mantém a conexão com o MongoDB.
 *
 * É importado uma única vez, no módulo raiz da aplicação ({@link AppModule}).
 * O `MongooseModule.forRoot*()` registra a conexão como um provider global, de
 * modo que os demais módulos não precisam importar este módulo de novo — apenas
 * pedir os models de que precisam com `MongooseModule.forFeature([...])`.
 *
 * Por que `forRootAsync` e não `forRoot`?
 * `forRoot({ uri })` exige a URI **no momento em que o arquivo é avaliado**, ou
 * seja, exigiria ler `process.env` direto. A versão `Async` adia a criação das
 * opções para o bootstrap, quando o container de injeção de dependências já
 * existe — permitindo obter a URI de um serviço (o `ConfigService`), que por sua
 * vez já validou o `.env`.
 *
 * As duas chaves trabalham em conjunto:
 * - `inject`   — lista as dependências a resolver, **na mesma ordem** em que
 *                aparecem como parâmetros de `useFactory`. Aqui, o
 *                `ConfigService`, que é resolvível sem `imports` porque o módulo
 *                raiz o registra como global (`ConfigModule.forRoot({ isGlobal:
 *                true })`).
 * - `useFactory` — função que devolve as opções de conexão do Mongoose
 *                (`MongooseModuleOptions`), já com a URI resolvida.
 *
 * @example
 * ```ts
 * // Em um módulo de feature, para registrar um schema:
 * @Module({
 *   imports: [
 *     DatabaseModule,
 *     MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
 *   ],
 * })
 * export class UsersModule {}
 * ```
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri: configService.get('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
  ],
})

export class DatabaseModule {
  static forFeature(models: ModelDefinition[]) {
    return MongooseModule.forFeature(models);
  }
}
