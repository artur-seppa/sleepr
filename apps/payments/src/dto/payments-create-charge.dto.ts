import { CreateChargeDto } from "@app/common/dto/create-charge.dto.js";
import { IsEmail } from "class-validator";

// Payload do TCP `create_charge` do ponto de vista do `payments`: o
// `CreateChargeDto` compartilhado (`card` + `amount`, o que o cliente HTTP manda
// em `charge`) MAIS o `email`. O `email` NÃO vem do cliente — `reservations`
// o injeta a partir do usuário autenticado (`ReservationsService.create`) — e
// existe só aqui (não em `libs/common`) porque só o `payments` precisa dele,
// para repassar ao evento `notify_email` do microserviço `notifications`.
export class PaymentsCreateChargeDto extends CreateChargeDto {
    @IsEmail()
    email: string
}
