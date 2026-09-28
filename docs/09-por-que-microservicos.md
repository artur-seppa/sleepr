# Por que microserviços (e por que TCP, não HTTP ou Kafka)

Notas de uma dúvida de estudo: por que `auth` e `reservations` conversam por
TCP em vez de HTTP ou Kafka, e — a pergunta mais de fundo — por que separar em
microserviços logo de cara.

## HTTP vs TCP — o transporte usado aqui

Dava para ser HTTP: `auth` expõe uma rota interna (ex. `GET /internal/verify`)
e `reservations` chama com `HttpModule`/axios. É um padrão real, chamado
**API composition**. Mas o transporte TCP do `@nestjs/microservices`
(`ClientsModule` + `@MessagePattern`, ver
[08 — Comunicação `auth` ↔ `reservations`](./08-comunicacao-auth-reservations-tcp.md))
tem vantagens específicas para comunicação **interna** entre serviços:

- **Abstração de transporte.** O código (`@MessagePattern(...)`,
  `client.send(...)`) não muda se trocar TCP por Redis, NATS, gRPC ou Kafka —
  só a config do `ClientsModule`/`connectMicroservice`. Com HTTP puro isso é
  mais amarrado (rotas, headers, client HTTP).
- **Request/response *e* fire-and-forget na mesma API.** `send()` (espera
  resposta) e `emit()` (dispara e esquece) são só uma troca de método — com
  HTTP puro só se tem request/response; "dispara e esquece" pediria outra
  solução por cima.
- **Menos overhead por chamada.** Conexão TCP persistente vs. handshake HTTP a
  cada request (sem keep-alive configurado). Importa mais em alto volume de
  chamadas internas.

O outro lado da moeda: TCP cru aqui é basicamente "RPC artesanal" — sem
retries, circuit breaker, load balancing ou service discovery prontos (teria
que ser adicionado à mão). Por isso em produção real é mais comum ver **gRPC**
(HTTP/2 + protobuf, tipado, com ecossistema de tooling) para chamada síncrona
interna. O TCP cru aqui serve para expor o mecanismo por baixo, sem a
complexidade extra do protobuf.

## Curiosidade — gRPC, o que o pessoal usa de verdade em produção

Citei gRPC acima como "o que se usaria de verdade" no lugar do TCP cru deste
projeto. Vale entender por quê.

### O que é

gRPC = um framework de RPC criado pelo Google, rodando sobre **HTTP/2** e
serializando as mensagens com **Protocol Buffers** (protobuf) em vez de JSON.
Em vez de escrever o contrato "na mão" (como o `UserDto`/`TokenPayload` deste
projeto — interfaces TypeScript que só existem em tempo de compilação, sem
nada garantindo que `auth` e `reservations` concordem em runtime), você
descreve o serviço uma vez num arquivo `.proto`:

```proto
service AuthService {
  rpc Authenticate (AuthRequest) returns (User);
}
message AuthRequest { string jwt = 1; }
message User { string id = 1; string email = 2; }
```

e ferramentas geram automaticamente o código cliente e servidor — em
TypeScript, Go, Python, Java, o que for. O NestJS suporta isso nativamente
(`Transport.GRPC` no `@nestjs/microservices`, apontando pro `.proto`).

### Por que é considerado "melhor" para RPC interno

- **Contrato reforçado, não combinado por convenção.** Aqui, se alguém mudar
  o shape de `UserDto` só do lado `auth`, o TS não avisa `reservations` — só
  quebra em runtime (foi quase o que aconteceu com o `data.user` no
  [08](./08-comunicacao-auth-reservations-tcp.md)). Com `.proto`, o contrato é
  um arquivo único, versionado, e o código gerado força os dois lados a
  respeitá-lo.
- **Payload binário, menor e mais rápido de (des)serializar** que JSON —
  importa em chamadas muito frequentes entre serviços (o típico "10 serviços
  se chamando várias vezes por request do usuário final").
- **HTTP/2 de verdade**: multiplexa várias chamadas numa única conexão TCP (ao
  contrário de HTTP/1.1, que sem pipelining trava uma request por vez por
  conexão), e suporta os 4 modos de streaming — não só request/response
  (unário), mas server-streaming, client-streaming e bidirecional (ex.: um
  serviço de posição de entrega enviando updates contínuos).
- **Deadlines/cancelamento e interceptors nativos** — dá pra propagar "essa
  chamada tem que responder em 200ms ou desiste" pela cadeia inteira de
  serviços, coisa que HTTP/TCP puro não tem de fábrica.
- **Ecossistema de infraestrutura.** Service meshes (Istio, Linkerd) e proxies
  (Envoy) foram desenhados em cima de HTTP/2, então gRPC se encaixa
  naturalmente em observability, retry policy e load balancing configurados
  fora do código da aplicação.

Empresas como Google (onde nasceu), Netflix, Square, Uber e Dropbox usam gRPC
pesadamente para comunicação interna entre serviços por esses motivos — não
para APIs públicas voltadas a navegador (aí REST/GraphQL sobre HTTP/1.1 ainda
domina, porque são mais fáceis de debugar com `curl`/DevTools e não exigem
gerar código cliente).

### O preço que se paga

- Menos "amigável a olho nu": não dá pra abrir o payload no DevTools ou
  `curl -d '{"foo":"bar"}'` — precisa de ferramentas específicas (`grpcurl`,
  BloomRPC) e o passo extra de compilar o `.proto`.
- Curva de aprendizado do protobuf + do modelo de streaming.
- Overkill para um projeto pequeno com 2 serviços e um contrato que muda
  pouco — exatamente o caso do Sleepr, onde TCP + JSON já deixa o conceito
  claro sem a complexidade extra.

## Por que não Kafka aqui

Kafka (e RabbitMQ) são bons para **eventos assíncronos**: "aconteceu X, quem
quiser reage" — múltiplos consumidores, durabilidade, replay, desacoplamento
total entre quem publica e quem consome. Não são pensados para "preciso de uma
resposta agora para decidir se libero essa request" — que é exatamente o caso
do `JWTAuthGuard`: ele *bloqueia* esperando saber se o JWT é válido antes de
deixar a rota seguir. Dá para simular request/reply em cima de Kafka (dois
tópicos + correlation ID), mas é rodeio para um caso que já é nativamente
síncrono.

Regra prática:

- **Síncrono / preciso-de-resposta-já** → HTTP, TCP, gRPC.
- **Assíncrono / notifico-e-sigo** → Kafka, RabbitMQ.

(Um caso de uso certo de broker, mais pra frente: "reserva criada → notifica
pagamento" — quem cria a reserva não precisa esperar o pagamento ser
processado para responder ao cliente.)

## Por que microserviço, afinal

O que se ganha:

- Escalar cada parte de forma independente (se `reservations` recebe muito
  mais tráfego que `auth`, escala só ela).
- Deploy independente — mudar `auth` não exige redeployar `reservations`.
- Cada serviço dono do seu próprio banco/schema, sem uma tabela/modelo
  compartilhado que todo mundo mexe.
- Times diferentes podem trabalhar em serviços diferentes sem pisar um no
  outro.
- Isolamento de falha *em teoria* — na prática, aqui `reservations` depende
  sincronamente de `auth` estar de pé (se `auth` cair, `POST /reservations`
  cai junto), então esse isolamento não vem de graça, precisa ser desenhado
  (timeouts, fallback, etc.).

O que se paga:

- Sistema distribuído = falha de rede vira parte do design (o que acontece se
  a conexão TCP cair no meio do `authClient.send`?). Num monólito essa chamada
  seria só uma função — nunca falha "sozinha".
- Debug mais difícil (precisa de tracing distribuído para seguir uma request
  por 2+ processos).
- Mais infraestrutura: neste projeto já são 2 portas HTTP + 2 portas TCP +
  MongoDB, para uma feature que num monólito seria um único processo.

**Para um projeto do tamanho do Sleepr**, um monólito seria objetivamente mais
simples e suficiente — não há múltiplos times nem necessidade real de escalar
`auth` e `reservations` de forma diferente. O valor de separar em
microserviços aqui é **didático**: aprender os primitivos (guard cruzando
processo, DTO trafegando serializado, transporte configurável — ver
[08](./08-comunicacao-auth-reservations-tcp.md)) que só compensam na prática
quando o motivo de negócio para separar (time, escala, deploy independente)
realmente existir.
