import {IsEmail, IsString} from "class-validator"

// Payload do evento TCP `notify_email` — o objeto que o `payments` passa em
// `notificationService.emit('notify_email', { email, text })`.
// - `email`: destinatário. Vem do usuário logado em `reservations`
//   (`UserDto.email`), que o repassa dentro do `create_charge` para o `payments`
//   (ver `PaymentsCreateChargeDto`).
// - `text`: corpo do e-mail, montado pelo próprio `payments`
//   (`"Your payment of $<amount> has completed successfully."`) — quem sabe o que
//   aconteceu é quem dispara o evento; o `notifications` só entrega a mensagem.
// Validado pelo `ValidationPipe` do `NotificationsController`. O assunto ainda é
// fixo no service ("Sleepr Notifications").
export class NotifyEmailDto {
    @IsEmail()
    email: string;

    @IsString()
    text: string
}
