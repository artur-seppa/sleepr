# Logger — Pino via `nestjs-pino`

O logging é montado em **dois pontos**, com papéis diferentes, e a configuração fica em **um só lugar** para não repetir em cada microserviço.

## As duas peças

| Peça | Onde | O que faz |
|---|---|---|
| `LoggerModule` (do `libs/common`) | `imports` do módulo raiz de cada app | Registra o provider `Logger` do Pino no container de DI **e** liga o middleware que loga toda requisição/resposta HTTP (`pinoHttp`). |
| `app.useLogger(app.get(Logger))` | `main.ts` de cada app | Troca o logger padrão do Nest (`ConsoleLogger`) pelo do Pino, para que os logs do **próprio framework** (`Logger` service, mensagens de bootstrap, exceptions) também passem pelo Pino. |

Precisa das duas: só o import não redireciona os logs internos do Nest; só o `useLogger` não existe sem o provider que o módulo registra.

## Peça 1 — `LoggerModule` em `libs/common/src/logger/logger.module.ts`

```ts
@Module({
  imports: [
    pinoLoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname', singleLine: true },
        },
      },
    }),
  ],
})
export class LoggerModule {}
```

- **`pinoLoggerModule`** é o `LoggerModule` do pacote `nestjs-pino`, importado com alias para não colidir com a nossa classe `LoggerModule`.
- **`forRoot(...)`** — mesmo padrão do Mongoose/Config (ver [Mongoose — `forRoot` vs `forFeature`](./02-mongoose-forroot-vs-forfeature.md)): configura o logger uma vez para a aplicação inteira.
- **`pinoHttp`** — ativa o middleware que loga automaticamente cada request HTTP (método, rota, status, tempo de resposta) sem precisar de `console.log` manual nos controllers.
- **`transport: pino-pretty`** — formata os logs coloridos, uma linha por log (`singleLine`), timestamp legível (`translateTime`), sem `pid`/`hostname` (`ignore`).
  - ⚠️ `pino-pretty` é **só para desenvolvimento** — ele derruba a performance do logger. Em produção: Pino puro (JSON), enviado para um coletor de logs centralizado.

### Por que fica no `common` e não em cada módulo

A configuração do Pino (transport, opções, `pinoHttp`) mora **num único arquivo**. Cada microserviço (`auth`, `reservations`, `payments`, …) só faz:

```ts
// <svc>.module.ts
imports: [LoggerModule]
```

Nenhuma opção de Pino é duplicada. Se amanhã quisermos mudar o formato, adicionar redaction de campos sensíveis, ou trocar o transport em produção, muda-se **um** arquivo e todos os serviços herdam.

## Peça 2 — `main.ts`

```ts
// apps/reservations/src/main.ts
import { Logger } from 'nestjs-pino';

const app = await NestFactory.create(ReservationsModule);
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
app.useLogger(app.get(Logger));
```

- **`app.get(Logger)`** — puxa a instância de `Logger` (a do `nestjs-pino`) que o `LoggerModule` registrou no container de DI.
- **`app.useLogger(...)`** — diz ao Nest para usar essa instância como logger da aplicação. Sem essa linha, `LoggerModule` ainda loga as requisições HTTP (via `pinoHttp`), mas as mensagens do framework e qualquer `new Logger(Contexto).log(...)` continuariam saindo pelo `ConsoleLogger` padrão — dois formatos de log misturados.
- Esse trecho de `main.ts` é o mesmo para todo microserviço: também não repete configuração, só liga o que o `common` já configurou.

## Fluxo de um log

```
request HTTP ───────────────► pinoHttp (LoggerModule)  ──► Pino ──► pino-pretty ──► console
código da app: logger.log() ─► Logger (nestjs-pino, via app.useLogger) ──┘
bootstrap / erros do Nest ───► idem ─────────────────────────────────────┘
```

Um único pipeline de saída, configurado uma vez no `libs/common`.
