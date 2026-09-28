# Validação de payload — `ValidationPipe` + DTOs

## Onde o pipe entra no fluxo de uma request

```
request HTTP → roteamento (qual controller/rota?) → PIPE → handler do controller → service
```

O pipe roda **antes** do método do controller. Se a validação falhar, o pipe lança `400 Bad Request` (com a lista de erros) e o controller **nem é executado**.

## Registro global — `apps/reservations/src/main.ts`

```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

- **`useGlobalPipes`** — aplica o pipe a **todas as rotas** da aplicação. Alternativa manual seria `@UsePipes(ValidationPipe)` rota a rota.
- **`ValidationPipe`** — pipe do Nest que valida o payload contra o DTO usando **class-validator** (os decorators `@IsDate()`, `@IsString()`, `@IsNotEmpty()`, …) + **class-transformer**.

## As opções usadas

| Opção | O que faz |
|---|---|
| `whitelist: true` | Remove do objeto toda propriedade **sem decorator de validação** no DTO. Cliente manda um campo a mais (`hacker: "x"`) → é descartado antes de chegar no service. Protege contra *mass-assignment*. |
| `transform: true` | Converte o payload cru numa **instância real da classe do DTO** (`new CreateReservationDto()`) e aplica as conversões de tipo — inclusive os `@Type(() => Date)`. Sem isso, o `@Type` não roda e o `@IsDate()` sempre falha. Também converte params de rota (`:id` string → number quando o tipo é `number`). |

## O DTO — `apps/reservations/src/dto/create-reservation.dto.ts`

```ts
export class CreateReservationDto {
  @IsDate()
  @Type(() => Date)   // 1º: converte string ISO do JSON → objeto Date (transforma)
  startDate: Date;    // 2º: @IsDate() valida, e só passa se já for instância de Date
  ...
}
```

Ordem de execução dentro do pipe: **transforma primeiro, valida depois**. Datas em JSON chegam como string; `@IsDate()` sozinho rejeitaria toda data vinda de HTTP — por isso o `@Type(() => Date)` é obrigatório junto.

A sintaxe `() => Date` é uma factory (lazy) — o class-transformer precisa dela para evitar problema de referência circular e porque decorators avaliam o tipo tarde.

## Fluxo completo numa request de `POST /reservations`

1. Body JSON cru chega
2. `transform` → vira instância de `CreateReservationDto`, strings ISO viram `Date`
3. `whitelist` → campos não declarados no DTO são removidos
4. class-validator roda os decorators → se falhar, `400` (controller não roda)
5. DTO limpo e tipado chega no controller → service
