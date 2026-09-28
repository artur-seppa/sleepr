import {CardDto} from './card.dto.js'
import { IsNumber, IsDefined, IsNotEmptyObject, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

// Payload de `POST/reservations` (campo `charge`, ver `create-reservation.dto.ts`)
// e do TCP `create_charge` que `reservations` manda para `payments`. Compartilhado
// em `libs/common` porque as DUAS pontas (quem monta o payload em `reservations`
// e quem valida/consome em `payments`) precisam do mesmo formato.
//
// `card` é `CardDto` (classe própria, com decorators) e não
// `Stripe.PaymentMethodCreateParams.Card` (o tipo que o SDK do Stripe usa): esse
// tipo do Stripe é só uma *interface* (apagada em runtime), então
// `@ValidateNested()`/`@Type(() => ...)` não teriam uma classe real para
// instanciar/validar. `CardDto` é a nossa versão validável do mesmo formato.
//
// O `payments` NÃO usa esta classe pura: usa `PaymentsCreateChargeDto`
// (`apps/payments/src/dto/`), que `extends` esta e acrescenta `email` — campo que
// o `reservations` injeta a partir do usuário logado, não vem do cliente HTTP.
export class CreateChargeDto {
    // `@IsDefined()` + `@IsNotEmptyObject()` — falha se `card` vier `undefined`
    // ou `{}`. `@ValidateNested()` + `@Type(() => CardDto)` — MESMA dupla usada
    // em `create-reservation.dto.ts`: o `@Type` transforma o objeto cru num
    // `CardDto` real (`class-transformer`), e só depois o `@ValidateNested`
    // desce e valida os campos de dentro (`cvc`, `number`, ...). Sem o `@Type`,
    // `card` continuaria um objeto plain — o `ValidationPipe` não entraria nele.
    @IsDefined()
    @IsNotEmptyObject()
    @ValidateNested()
    @Type(() => CardDto)
    card: CardDto;

    @IsNumber()
    amount: number;
}
