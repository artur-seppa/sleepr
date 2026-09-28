/**
 * Config do builder rspack usado pelo `nest build` (apontado em nest-cli.json).
 *
 * Dois ajustes:
 *
 * 1. output.filename — workaround para @nestjs/cli@12 em monorepo.
 *    `nest build` emite o bundle em `dist/<project-root>/main.js`
 *    (ex. dist/apps/reservations/main.js), mas `nest start` procura em
 *    `dist/<sourceRoot>/main.js` (ex. dist/apps/reservations/src/main.js) e
 *    depois cai para `dist/main.js` - nenhum dos dois existe, daí o
 *    "Cannot find module '.../dist/main'".
 *    Injetar o segmento `src/` faz o arquivo cair onde o `nest start` espera.
 *
 * 2. externals — nada de node_modules entra no bundle.
 *    O padrão do Nest usa `webpack-node-externals`, que monta a lista lendo os
 *    diretórios de `node_modules/` na raiz. Isso QUEBRA com pnpm workspace: as
 *    dependências do app passam a viver em `apps/<app>/node_modules`, a lista
 *    sai vazia, o rspack tenta bundlar o `@nestjs/core` e engasga nos `require`
 *    opcionais dele (kafkajs, mqtt, nats, redis, amqplib) - os "9 errors" em
 *    client-kafka.js, server-mqtt.js etc.
 *    Aqui a regra não depende de onde o node_modules está: tudo que não for
 *    caminho relativo/absoluto vira `require` externo, resolvido em runtime.
 *    A exceção é o `@app/common`, que É código nosso (path mapping do tsconfig
 *    para libs/common/src) e precisa entrar no bundle.
 */
module.exports = (options) => ({
  ...options,
  externals: [
    ({ request }, callback) => {
      const isLocal =
        !request ||
        request.startsWith('.') ||
        request.startsWith('/') ||
        request.startsWith('@app/');

      return isLocal ? callback() : callback(null, `node-commonjs ${request}`);
    },
  ],
  output: {
    ...options.output,
    filename: options.output.filename.replace(/\/([^/]+)$/, '/src/$1'),
  },
});
