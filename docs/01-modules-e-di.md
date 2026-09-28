# Módulos e Injeção de Dependência

## O que é o `@Module()`?

`@Module()` é um **decorator** do NestJS: uma função que anexa metadados à classe declarada logo abaixo dele (ex.: `export class DatabaseModule {}`). Esses metadados não executam nada sozinhos — quem os lê é o **Nest IoC Container**, durante o `bootstrap()` (em `main.ts`), para montar o grafo de dependências de toda a aplicação.

Um módulo é a unidade de organização do Nest: agrupa código relacionado e declara, para o container, quatro coisas:

| Propriedade | Pergunta que responde |
|---|---|
| `imports` | "quais outros módulos eu preciso para funcionar?" |
| `providers` | "quais classes (services, etc.) eu **crio** e disponibilizo para injeção *dentro* deste módulo?" |
| `controllers` | "quais rotas HTTP este módulo expõe?" |
| `exports` | "do que eu crio, o que eu deixo outros módulos usarem depois de me importar?" |

**Regra chave:** `exports` é uma *allowlist*. Se um provider não for exportado, ele fica trancado dentro do módulo — mesmo que outro módulo importe esse módulo, não consegue injetar aquilo.

---

## Por que cada módulo do `libs/common` aloca o que aloca

### Config — direto em cada app (não há mais `ConfigModule` no `common`)

Existia um wrapper `libs/common/src/config/config.module.ts`. Ele foi **removido**. Cada microserviço agora chama o `ConfigModule` oficial do `@nestjs/config` no seu **próprio módulo raiz**:

```ts
// apps/reservations/src/reservations.module.ts  (o análogo está em apps/auth)
imports: [
  ConfigModule.forRoot({
    isGlobal: true,
    validationSchema: Joi.object({
      MONGODB_URI: Joi.string().required(),
      PORT: Joi.number().port().required(),
    }),
  }),
  // ...
]
```

Por que saiu do `common`:

- **`.env` por app.** Cada serviço tem o seu: `apps/reservations/.env`, `apps/auth/.env` — não há mais um `.env` na raiz. O `docker-compose.yaml` aponta cada serviço para o dele (`env_file: ./apps/<svc>/.env`). Assim `auth` pode exigir `JWT_SECRET`/`JWT_EXPIRATION`, que `reservations` nem conhece.
- **`validationSchema` por app.** O schema (Joi) lista só as variáveis que *aquele* serviço precisa. Se faltar alguma, o serviço **não sobe** (*fail fast*).
- **`isGlobal: true`** — registra o `ConfigService` como provider global *daquele* app. Qualquer módulo do serviço injeta `ConfigService` sem reimportar nada — inclusive o `DatabaseModule` do `common`, que depende dele no `forRootAsync` (ver abaixo). O wrapper no `common` existia basicamente para reexportar o `ConfigService` via `exports`; com `isGlobal: true` isso deixou de ser necessário.

#### `ConfigService` — a instância que lê o `.env`

`ConfigModule.forRoot()` carrega o `.env`, roda o Joi e registra **uma instância de `ConfigService`** no container de DI. É essa instância (não o `process.env` cru) que o resto do código usa para ler variáveis — já validadas. Pense nela como o "config do app tratado": um objeto só de leitura por cima do `.env` daquele serviço.

Uso típico, na definição da porta em `main.ts`:

```ts
// apps/reservations/src/main.ts  (idem apps/auth, trocando a porta)
const app = await NestFactory.create(ReservationsModule);
// ...
const configService = app.get(ConfigService);
await app.listen(configService.getOrThrow<number>('PORT'));
```

- **`app.get(ConfigService)`** — pega a instância pelo **token de classe**. `app.get('ConfigService')` (string) **não funciona**: o `@nestjs/config` não registra token de string. Foi esse o erro `Nest could not find ConfigService element`.
- **`getOrThrow<number>('PORT')`** — devolve o valor já sem `undefined` (e estoura se faltar, coerente com o *fail fast*). O `get('PORT')` comum retorna `string | number | undefined` e não entra direto no `listen`.

### `DatabaseModule` — `libs/common/src/database/database.module.ts`

```ts
imports: [
  MongooseModule.forRootAsync({
    useFactory: (configService: ConfigService) => ({ uri: configService.get('MONGODB_URI') }),
    inject: [ConfigService],
  }),
],
```

- Não tem `providers` nem `exports` porque ele não cria nada próprio — só delega ao `MongooseModule`, que já registra a conexão como provider global internamente (decisão de design do próprio pacote `@nestjs/mongoose`, não do Nest em geral).
- **Não precisa de `imports: [ConfigModule]` na factory.** O `ConfigService` é resolvível aqui porque cada app o registra como global (`ConfigModule.forRoot({ isGlobal: true })` no módulo raiz). Um `DatabaseModule` isolado, sem esse registro global em algum lugar da árvore, quebraria no `inject`.
- **Por que `forRootAsync` e não `forRoot`?** `forRoot({ uri })` exigiria a URI no momento em que o arquivo é avaliado (leitura direta de `process.env`). A versão `Async` adia a criação das opções para o bootstrap, quando o container de DI já existe — permitindo obter a URI de um serviço (`ConfigService`) que já validou o `.env`.
- `inject` lista as dependências a resolver, **na mesma ordem** em que aparecem como parâmetros de `useFactory`.

---

## "Global" tem dois sentidos diferentes no Nest — não confundir

### `@Global()` — decorator do Nest

Se um módulo é marcado com `@Global()`, uma vez importado **uma única vez** em qualquer lugar da árvore de módulos, seus `exports` ficam disponíveis para injeção em **qualquer** módulo da aplicação, sem precisar reimportar.

É exatamente o que `ConfigModule.forRoot({ isGlobal: true })` faz: `isGlobal` marca o módulo de config como `@Global()`, então o `ConfigService` fica visível em todo o app depois de uma única chamada no módulo raiz.

Já o `DatabaseModule` **não** usa `@Global()` — quem quiser precisa importar (`imports: [DatabaseModule]`). O que fica global é só o *provider da conexão* que o `@nestjs/mongoose` registra por dentro. É o que o módulo raiz de cada serviço faz:

```ts
@Module({
  imports: [DatabaseModule /* , ... */],
})
export class ReservationsModule {}
```

### "Global" no sentido de monorepo / microserviços

Esse é o sentido que interessa para este projeto: é sobre **onde o código mora**, não sobre o decorator.

O `nest-cli.json` já declara `libs/common` como um projeto de biblioteca:

```json
"projects": {
  "common": { "type": "library", "root": "libs/common", "entryFile": "index", "sourceRoot": "libs/common/src" }
}
```

Essa é a estrutura clássica de um **monorepo Nest para microserviços**: uma pasta `apps/` com vários microserviços independentes (ex.: `auth`, `reservations`, `payments`, `notifications`), cada um com seu próprio módulo raiz (`reservations.module.ts`, `auth.module.ts`, …), e todos importando a infra compartilhada de `@app/common` (`DatabaseModule`, `LoggerModule`) em vez de duplicá-la em cada serviço.

O `tsconfig.json` habilita isso via path mapping:

```json
"paths": {
  "@app/common": ["./libs/common/src"],
  "@app/common/*": ["./libs/common/src/*"]
}
```

**Conclusão prática:** cada microserviço (`reservations`, `auth`, e os futuros `payments`, `notifications`, …) tem seu próprio módulo raiz importando de `@app/common` o que é infra compartilhada — `DatabaseModule` (conexão) e `LoggerModule` (Pino). Isso é reuso via **importação de biblioteca compartilhada**, não `@Global()`: cada serviço declara o import no seu próprio módulo.

O **config** é a exceção: não vem do `common`. Cada app chama `ConfigModule.forRoot({ isGlobal: true, validationSchema })` no próprio módulo raiz, com o seu `.env` e o seu schema (ver seção acima). Fica global *dentro daquele serviço*, mas não é código compartilhado.
