import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from './users/users.module.js';
import { LoggerModule } from '@app/common/logger/logger.module.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { LocalStrategy } from './strategies/local.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { PassportModule } from '@nestjs/passport';

/**
 * Módulo raiz da aplicação de autenticação.
 *
 * É o módulo entregue ao `NestFactory.create(...)` em `main.ts` (porta 3001).
 * Concentra a configuração global da app (env, logger, JWT) e delega o acesso a
 * usuários para o {@link UsersModule}.
 *
 * Imports:
 *
 * - `UsersModule` — feature module de usuários. É ele quem importa o
 *   `DatabaseModule` "pelado" (abre e mantém a conexão com o MongoDB) e registra
 *   o model `UserDocument` via `forFeature`. O `AuthModule` não fala com o banco
 *   diretamente.
 *
 * - `ConfigModule.forRoot({ isGlobal, validationSchema })` — lê o `.env` e valida
 *   na inicialização com Joi (`MONGODB_URI`, `JWT_SECRET` e `JWT_EXPIRATION`, os
 *   três obrigatórios). Se algum faltar, a app não sobe (*fail fast*). Sendo
 *   `isGlobal`, o `ConfigService` fica disponível em toda a app sem reimportar o
 *   módulo.
 *
 * - `LoggerModule` — logger Pino (configurado em `@app/common/logger`) para logs
 *   de requisição HTTP e de aplicação.
 *
 * - `JwtModule.registerAsync({ useFactory })` — monta a configuração de
 *   assinatura/verificação dos tokens: `secret` = `JWT_SECRET`, expiração =
 *   `JWT_EXPIRATION` segundos. Usa `registerAsync` (e não `register`) para adiar
 *   a criação das opções até o bootstrap, quando o `ConfigService` já existe.
 *   Ver {@link DatabaseModule} para o padrão completo (`imports` + `inject` +
 *   `useFactory`).
 *
 * - `PassportModule.register(...)` — precisa estar aqui porque `AuthController`
 *   usa `@UseGuards(LocalAuthGuard)` (`AuthGuard('local')`), que injeta
 *   `AuthModuleOptions` (opcionalmente). O `PassportModule` "pelado" é só uma
 *   `@Module({})` vazia — não basta importar a classe, é o `.register(...)`
 *   que de fato registra o provider `AuthModuleOptions`. Sem ele em nenhum
 *   módulo da app, o bootstrap quebra com `UnknownDependenciesException`. Pelo
 *   mesmo motivo, o `UsersModule` importa `PassportModule.register(...)`
 *   também (por causa do `JWTAuthGuard` no `UsersController`).
 *
*/
@Module({
  imports: [
    UsersModule, 
    ConfigModule.forRoot({
      isGlobal: true,
      // Cada chave do schema é uma variável de ambiente obrigatória ou opcional.
      // Novas variáveis (PORT, JWT_SECRET, ...) devem ser adicionadas aqui.
      validationSchema: Joi.object({
        MONGODB_URI: Joi.string().required(),
        HTTP_PORT: Joi.number().port().required(),
        TCP_PORT: Joi.number().port().required(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRATION: Joi.string().required(),
      }),
    }), // Carrega e valida o .env, e disponibiliza o ConfigService para injeção de dependência
    
    LoggerModule, // Captura logs de requisições HTTP e logs de aplicação, usando Pino como logger configurado no common/logger.module.ts
    PassportModule.register({ defaultStrategy: 'local' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: `${configService.get('JWT_EXPIRATION')}s`
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
})
export class AuthModule {}
