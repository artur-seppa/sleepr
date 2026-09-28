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

### ⚠️ Erro que tomei aqui — `could not find expected ':'`

O primeiro trigger falhou em **1 segundo**, com duração `—` no painel: nem
chegou a subir um container.

```
failed unmarshalling build config cloudbuild.yaml: yaml: line 18: could not find expected ':'
```

"Duração `—`" já é a pista: o build morreu na leitura do arquivo, antes de
qualquer step. Ou seja, não era permissão nem trigger — era o YAML.

O culpado estava na linha **15**, não na 18:

```yaml
  - name: 'gcr.io/cloud-builders/docker'
    args:                                       # <- chave na coluna 4
    ['push', 'us-east4-docker.pkg.dev/...']     # <- valor na coluna 4 TAMBÉM
```

Em YAML, o valor de uma chave em bloco precisa estar **mais indentado** que a
chave. Na mesma coluna, o parser não lê aquilo como o valor de `args:` — lê como
uma **nova chave** do mesmo mapa, e fica esperando os dois-pontos dela. Ele só
desiste na linha 18, quando encontra o `- name:` do próximo step. Por isso o
erro aponta um lugar onde não há nada de errado.

Os steps de `build` passavam porque o `[` deles já estava na coluna 6. Só os
quatro `push` estavam rasos. A correção é só indentação:

```yaml
  - name: 'gcr.io/cloud-builders/docker'
    args:
      ['push', 'us-east4-docker.pkg.dev/sleepr-509119/notifications']
```

**Lição:** o número da linha num erro de YAML aponta onde o parser *desistiu*,
não onde o erro *está*. O problema costuma estar acima.

E dá para não descobrir isso pelo console: um parse local pega o mesmo erro em
segundos, antes de commitar.

```bash
python3 -c "import yaml;yaml.safe_load(open('cloudbuild.yaml'))"
```

```bash
# ou, se preferir ver o build pelo terminal em vez do painel
gcloud builds list --limit=3 --format="value(id,status,statusDetail)"
gcloud builds log <BUILD_ID>
```

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

### ⚠️ Segundo erro — `build.service_account is specified`

Com o YAML consertado, o build passou da leitura do arquivo e morreu na
validação, em 3 segundos:

```
invalid argument: if 'build.service_account' is specified, the build must either
(a) specify 'build.logs_bucket', (b) use the REGIONAL_USER_OWNED_BUCKET
build.options.default_logs_bucket_behavior option, or (c) use either
CLOUD_LOGGING_ONLY / NONE logging options
```

Não é erro de sintaxe nem de permissão: é uma **escolha que o Google parou de
fazer por mim**.

Historicamente o Cloud Build rodava com uma service account gerenciada por ele e
despejava os logs num bucket do Cloud Storage que era dele também. Em projetos
novos, o build roda com uma service account **do meu projeto**
(`build.service_account`) — e aí não existe mais um bucket "da casa" para onde
mandar log. O Google se recusa a adivinhar e exige que eu diga onde os logs vão
parar, listando as três saídas possíveis.

Escolhi a (c), que é a mais simples: mandar tudo para o Cloud Logging e não usar
bucket nenhum.

```yaml
options:
  logging: CLOUD_LOGGING_ONLY
```

| opção | o que faz |
|---|---|
| `CLOUD_LOGGING_ONLY` | logs só no Cloud Logging — sem bucket para criar ou pagar |
| `NONE` | sem log; só serve se você não quiser depurar nada |
| `logs_bucket` | você cria um bucket no GCS e aponta para ele |
| `default_logs_bucket_behavior: REGIONAL_USER_OWNED_BUCKET` | o Cloud Build cria o bucket no seu projeto, na região do build |

`options` é um campo **de topo** do `cloudbuild.yaml`, irmão de `steps` — não vai
dentro de nenhum step.

**Lição:** vale ler o erro até o fim antes de procurar culpado. Ele não só diz o
que está errado, como **lista as saídas** — bastava escolher uma.

## ⚠️ Pontos a revisar neste `cloudbuild.yaml`

Três coisas do arquivo inicial não fechavam com o que aprendi no
[container.md](./introducao/container.md). A primeira derrubou o build; as
outras duas continuam pendentes:

**1. O caminho da imagem parava no repositório — confirmado no build.** A
anatomia completa é `host/projeto/repo/imagem:tag`, e o arquivo usava:

```
us-east4-docker.pkg.dev/sleepr-509119/notifications
└──────── host ────────┘ └── projeto ─┘ └── repo ──┘   ← falta o nome da imagem
```

O `build` (step #0) passou sem reclamar — o Docker aceita qualquer string como
tag. Quem recusou foi o **registry**, no `push`:

```
name invalid: Missing image name.
Pushes should be of the form docker push HOST-NAME/PROJECT-ID/REPOSITORY/IMAGE
ERROR: build step 1 "gcr.io/cloud-builders/docker" failed: step exited with non-zero status: 1
```

Ou seja: o Artifact Registry **não** aceita push na raiz do repositório. O
repositório é uma pasta, não um destino — precisa do nome da imagem dentro dele.
A correção foi acrescentar `/production` (o mesmo nome que usei no push manual)
nos oito lugares:

```yaml
'us-east4-docker.pkg.dev/sleepr-509119/notifications/production'
```

Dois aprendizados aqui:

- **`docker build -t` não valida nada.** A tag é só um rótulo local; o erro de
  caminho só aparece no push, quando o registry opina. Um caminho errado passa
  reto por todo o build.
- **A numeração dos steps no log é 0-based.** `Finished Step #1` era o *segundo*
  step — o push do `notifications` —, não o primeiro.

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
