# tsconfig no monorepo — erro `TS6059` / `rootDir` (resolvido)

## O que acontecia

```
File '.../libs/common/src/database/database.module.ts' is not under 'rootDir'
'.../apps/reservations/src'. 'rootDir' is expected to contain all source files.
```

`apps/reservations/tsconfig.app.json` tinha `"composite": true` + `"rootDir": "./src"`. O `rootDir` é uma **promessa**: "todo arquivo-fonte desta compilação está dentro deste diretório" — e serve para o TS calcular o layout do `outDir` (espelha a árvore relativa ao `rootDir`).

O `paths` do `tsconfig.json` raiz aponta para o **source** da lib:

```json
"paths": { "@app/common/*": ["./libs/common/src/*"] }
```

Então `import ... from '@app/common/database/database.module.js'` resolve para o `.ts` real em `libs/common/src/...`. O TS segue o import e inclui esse arquivo na compilação do `reservations` — mas ele está **fora** de `apps/reservations/src`, quebrando a promessa. `composite: true` transforma isso de aviso em **erro**, porque exige `rootDir` explícito contendo tudo.

## Por que não era problema para o build

O build real é **rspack** (`nest-cli.json` → `"builder": "rspack"`), e os testes usam **vitest** (`vite-tsconfig-paths`). Nenhum dos dois usa `tsc` para emitir — `tsc` aqui só faz type-check/IDE. Ou seja, o erro era só de análise, o `nest build` sempre funcionou.

## Correção aplicada (Opção A — volta ao padrão Nest monorepo)

`apps/reservations/tsconfig.app.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "declaration": false,
    "noEmit": true,       // tsc não emite; quem emite é o rspack
    "rootDir": "../.."     // as fontes deste programa abrangem apps/ + libs/ (repo)
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- **Removido `composite: true`** — não usávamos project references de verdade (nada roda `tsc -b`).
- **`rootDir: "../.."`** — declara honestamente que as fontes vão até a raiz do repo (código do app + `libs/common`). É o que o TS já inferia silenciosamente antes; agora explícito, o `TS6059` some.
- **`noEmit: true`** — como o `rootDir` na raiz do repo geraria um layout de saída aninhado feio (`dist/apps/reservations/apps/reservations/src/...`), e o rspack é quem emite de verdade, o `tsc` fica só com type-check.
- **`tsconfig.json` raiz** — removidos `"files": []` e o bloco `"references"` (que ainda por cima listava `tsconfig.app.json` duplicado e nunca referenciava `libs/common`). Virou um config compartilhado simples, como o `nest new --monorepo` gera.

## Compatível com o futuro de microserviços

Esse é o modelo canônico de monorepo Nest para microserviços: `libs/common` fica como **código-fonte compartilhado**, e cada `apps/<svc>` é empacotado de forma independente pelo rspack (`nest build <svc>` → `dist/apps/<svc>/main.js` autocontido, já com o `libs/common` embutido). Cada novo microserviço repete esse mesmo `tsconfig.app.json` de 3 linhas.

A alternativa (Opção C: `libs/common` como projeto `composite` consumido pelos `.d.ts` em `dist/`) exigiria buildar a lib antes de todo type-check — mais atrito no dev, sem ganho real aqui.

## Pendência relacionada, ainda aberta

`libs/common/tsconfig.lib.json` ainda tem `"composite": true`. Não causa erro (a lib só importa dentro do próprio `src`), mas é resquício do setup de project references que abandonamos — pode ser removido junto com o `rootDir`/`declaration` dele numa limpeza futura.
