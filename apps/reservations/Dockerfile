FROM node:22-alpine AS development

RUN npm install -g pnpm

WORKDIR /app

# Manifestos primeiro: enquanto eles não mudarem, o Docker reaproveita o cache
# do install. Só os do workspace que ESTA imagem precisa — a raiz (toolchain),
# o app e a lib compartilhada. Os outros microserviços não entram.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/reservations/package.json apps/reservations/
COPY libs/common/package.json libs/common/

# `--filter reservations...` (com os três pontos) = o app + suas dependências dentro
# do workspace, ou seja, o @app/common junto. As deps exclusivas dos outros
# microserviços ficam de fora.
RUN pnpm install --filter reservations...

# Arquivos de build que o `nest build` lê da raiz:
# - nest-cli.json     → qual projeto compilar, qual builder usar
# - rspack.config.cjs → apontado pelo nest-cli.json (builder rspack)
# - tsconfig.json     → base que o tsconfig.app.json do app estende
COPY nest-cli.json rspack.config.cjs tsconfig.json ./

COPY apps/reservations apps/reservations
COPY libs libs

# O nome do projeto é obrigatório: `nest build` sem argumento compila o projeto
# `root` do nest-cli.json (que é o reservations), não este app.
RUN pnpm run build reservations

# Monta em /prod-deps um node_modules achatado e self-contained, só com as
# dependências de runtime deste app. É o que vai para a imagem final — por isso
# o pnpm (~75MB instalado via npm) fica para trás neste estágio.
RUN pnpm deploy --filter reservations --prod /prod-deps

FROM node:22-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Nenhum gerenciador de pacotes aqui: tudo chega pronto do estágio anterior.
COPY --from=development /prod-deps/node_modules ./node_modules
COPY --from=development /app/dist ./dist

CMD ["node", "dist/apps/reservations/src/main.js"]
