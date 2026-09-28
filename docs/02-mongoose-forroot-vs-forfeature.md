# Mongoose — `forRoot` vs `forFeature`

Conexão global, schemas por módulo.

Padrão do NestJS reaproveitado por Mongoose, TypeORM, Config, etc. Separa duas responsabilidades que costumam ser confundidas:

| Método | Responde | Escopo | Onde chamar |
|---|---|---|---|
| `forRoot` / `forRootAsync` | "como abro **a conexão** com o banco?" | aplicação inteira, uma vez | módulo raiz |
| `forFeature` | "quais **models** *este* módulo usa?" | local ao módulo que chama | cada feature module |

**Não existe um lugar onde eu registro todos os schemas do app.** O `DatabaseModule` só cuida da conexão — ele não conhece schema nenhum. Cada módulo de feature registra os seus:

```ts
// reservations.module.ts
imports: [DatabaseModule.forFeature([{ name: ReservationDocument.name, schema: ReservationSchema }])]

// users.module.ts (hipotético)
imports: [DatabaseModule.forFeature([{ name: UserDocument.name, schema: UserSchema }])]
```

## O que `forFeature` faz de concreto

`DatabaseModule.forFeature(models)` é só um atalho:

```ts
static forFeature(models: ModelDefinition[]) {
  return MongooseModule.forFeature(models);
}
```

Para cada `{ name, schema }` (um `ModelDefinition`), o `MongooseModule.forFeature`:

1. cria um **provider** para o `Model<...>` do Mongoose;
2. dá a esse provider o **token** igual ao `name` — `ReservationDocument.name` vira a string `"ReservationDocument"`;
3. deixa esse provider disponível **apenas dentro do módulo que chamou** `forFeature`.

É por isso que o repository consegue injetar o model com o token combinando:

```ts
constructor(
  @InjectModel(ReservationDocument.name)          // mesmo token do forFeature
  reservationModel: Model<ReservationDocument>,
) { super(reservationModel); }
```

## Consequência prática

Se o `PaymentsModule` também precisar do model de `Reservation`, ele tem que chamar `forFeature([{ Reservation }])` de novo no próprio `imports` (ou o `ReservationsModule` exportar esse provider). O registro é **por módulo**, não global.

Resumo: **conexão num lugar só (global, via `DatabaseModule` pelado no root); schemas espalhados por módulo (local, via `.forFeature`)**.
