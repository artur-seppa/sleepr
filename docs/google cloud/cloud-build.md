# Cloud Build — CI/CD das imagens dos microserviços

O [Artifact Registry](./introducao/container.md) resolveu o **depósito**: as
quatro imagens já vivem na nuvem. Mas até aqui quem construía e empurrava era
eu, na minha máquina, em loop de `docker build` + `docker tag` + `docker push`.

O Cloud Build é quem assume esse trabalho: a cada push no GitHub, ele levanta
uma máquina efêmera, roda o build dos containers e publica no registry — sem
depender do meu Docker local.

> Cloud Build, Google Cloud's continuous integration (CI) and continuous
> delivery (CD) platform, lets you build software quickly across all languages.
> Get complete control over defining custom workflows for building, testing, and
> deploying across multiple environments such as VMs, serverless, Kubernetes, or
> Firebase.

Dividindo os papéis do deploy até agora:

| peça | papel |
|---|---|
| `Dockerfile` | **como** cada microserviço vira imagem |
| Artifact Registry | **onde** a imagem fica guardada |
| Cloud Build | **quem** constrói e empurra, e **quando** |
| GKE (próximo passo) | quem puxa do registry e **roda** |

## 1. Ativar a API

Como todo serviço do Google Cloud, o Cloud Build precisa ser ativado no projeto
antes de existir. Busca por "Cloud Build" no console e ativa — ou, pelo
terminal:

```bash
gcloud services enable cloudbuild.googleapis.com
```

## 2. O `cloudbuild.yaml`

É o arquivo na raiz do repositório que descreve o pipeline. A estrutura é uma
lista de `steps`, e **cada step é um container** que o Cloud Build sobe:

```yaml
steps:
  # notifications
  - name: 'gcr.io/cloud-builders/docker'
    args:
      [
        'build',
        '-t',
        'us-east4-docker.pkg.dev/sleepr-509119/notifications',
        '-f',
        'apps/notifications/Dockerfile',
        '.',
      ]
  - name: 'gcr.io/cloud-builders/docker'
    args:
      ['push', 'us-east4-docker.pkg.dev/sleepr-509119/notifications']
```

Lendo um step:

| campo | o que é |
|---|---|
| `name` | a **imagem** que vai rodar esse passo — aqui `gcr.io/cloud-builders/docker`, um container que tem o Docker CLI dentro |
| `args` | os argumentos passados para o entrypoint dessa imagem — ou seja, o que viria depois de `docker` na linha de comando |

Então este step é literalmente o mesmo comando do passo manual:

```bash
docker build -t us-east4-docker.pkg.dev/sleepr-509119/notifications -f apps/notifications/Dockerfile .
```

Dois detalhes que não são óbvios:

- **`.` continua sendo a raiz do monorepo.** O Cloud Build clona o repositório
  em `/workspace` e roda cada step com esse diretório como working dir. Como o
  contexto de build precisa enxergar `libs/`, `nest-cli.json` e os `tsconfig`
  (ver o passo 4 do [container.md](./introducao/container.md)), o `.` daqui é
  exatamente o `.` que eu usava rodando da raiz na minha máquina.
- **Os steps rodam em sequência e compartilham o `/workspace`.** São containers
  diferentes, mas o volume é o mesmo — por isso o step de `push` encontra a
  imagem que o step de `build` produziu.
- **Não tem `gcloud auth configure-docker` aqui.** Lá na máquina local eu
  precisei configurar o *credential helper*; dentro do Cloud Build a
  autenticação já vem da service account do build, que roda dentro do próprio
  projeto.

São 8 steps no total: um `build` + um `push` para cada um dos quatro
microserviços (`notifications`, `auth`, `reservations`, `payments`).

## 3. O trigger — ligando o GitHub

O `cloudbuild.yaml` só descreve *o que* fazer. Quem define *quando* é o
**trigger**.

No console: Cloud Build → Triggers → "Connect repository", autoriza o Google
Cloud Build no GitHub, escolhe o repositório e cria o trigger apontando para o
arquivo de configuração. Os campos que importam:

| campo | valor |
|---|---|
| Event | `Push to a branch` |
| Branch | `^main$` |
| Configuration | `Cloud Build configuration file (yaml or json)` |
| Location | `/cloudbuild.yaml` |

Resultado: qualquer push na `main` dispara o pipeline, que reconstrói as quatro
imagens e sobrestitui as que estão no Artifact Registry.

### Permissão para escrever no registry

O build roda com uma service account do projeto, e ela precisa do papel
**Artifact Registry Writer** para o `docker push` passar. Se o pipeline quebrar
no push com `denied` / `permission_denied`, é isso — e não o `cloudbuild.yaml`.

Também é comum, em projetos novos, o build falhar logo no começo reclamando de
*logging*. Nesse caso é preciso declarar explicitamente onde vão os logs:

```yaml
options:
  logging: CLOUD_LOGGING_ONLY
```

## ⚠️ Pontos a revisar neste `cloudbuild.yaml`

Escrevendo esta nota, três coisas do arquivo atual não fecham com o que aprendi
no [container.md](./introducao/container.md):

**1. O caminho da imagem para no repositório.** A anatomia completa é
`host/projeto/repo/imagem:tag`, e o arquivo usa:

```
us-east4-docker.pkg.dev/sleepr-509119/notifications
└──────── host ────────┘ └── projeto ─┘ └── repo ──┘   ← falta o nome da imagem
```

Manualmente eu empurrei para `.../notifications/production`. Confirmar no
primeiro build se o Artifact Registry aceita o push direto na raiz do
repositório ou se precisa do segmento da imagem — se precisar, é só acrescentar
`/production` nos oito lugares.

**2. Sem tag, tudo vira `latest`.** Toda build sobrescreve a anterior e não há
como saber qual commit gerou a imagem que está rodando. O Cloud Build expõe
substituições justamente para isso:

```yaml
'-t', 'us-east4-docker.pkg.dev/$PROJECT_ID/notifications/production:$SHORT_SHA',
```

| substituição | valor |
|---|---|
| `$PROJECT_ID` | id do projeto (tira o `sleepr-509119` hardcoded) |
| `$COMMIT_SHA` | o SHA completo do commit que disparou o build |
| `$SHORT_SHA` | os 7 primeiros caracteres |
| `$BRANCH_NAME` | a branch |

O padrão é taggear com o SHA **e** com `latest`, para ter rastreabilidade sem
perder o apelido móvel.

**3. Os quatro `push` poderiam ser um bloco `images`.** O campo `images` no fim
do arquivo faz o Cloud Build empurrar as imagens depois que todos os steps
passam, e ainda as registra no resultado do build:

```yaml
images:
  - 'us-east4-docker.pkg.dev/$PROJECT_ID/notifications/production:$SHORT_SHA'
  - 'us-east4-docker.pkg.dev/$PROJECT_ID/auth/production:$SHORT_SHA'
  # ...
```

Isso corta quatro steps e tem um efeito bom: se o build do `payments` falhar,
nada é publicado — hoje, com os pushes intercalados, `notifications` e `auth` já
teriam subido.

## Ideias para depois

- **Paralelizar os builds.** Por padrão cada step espera o anterior; como os
  quatro apps são independentes, dá para rodá-los juntos com `waitFor: ['-']`,
  que faz o step começar imediatamente em vez de esperar a fila.
- **Build só do que mudou.** Hoje um commit que mexe só no `auth` reconstrói os
  quatro. Resolver isso exige um step que olhe o diff — vale a pena só quando o
  build começar a doer.
- **Cache de camadas.** A máquina do build é efêmera e começa sem nada em cache,
  então todo `pnpm install` roda do zero. `--cache-from` apontando para a imagem
  anterior no registry é o caminho.
- **Testes antes do build.** Um step rodando `pnpm test` antes dos builds é o que
  transforma isso de "publicador automático" em CI de verdade.

## Resumo

```
push na main
   └─▶ trigger do Cloud Build
         └─▶ clona o repo em /workspace
               └─▶ 4× docker build  (-f apps/<app>/Dockerfile, contexto = .)
               └─▶ 4× docker push   (Artifact Registry)
                     └─▶ imagem pronta para o GKE puxar
```
