// Tokens de DI usados nas DUAS pontas de cada comunicação TCP entre microserviços.
// Cada token é só uma string; o valor em si não importa, só precisa ser o MESMO nos
// dois lados: o `name` do client em `ClientsModule.registerAsync([{ name: TOKEN, ... }])`
// (é o que faz o Nest criar um provider `ClientProxy` injetável) e o
// `@Inject(TOKEN)` de quem consome esse client.

// auth — cliente: `reservations` (`reservations.module.ts`); consumidor: o guard
// `@Inject(AUTH_SERVICE) private readonly authClient: ClientProxy`
// (`jwt-auth.guard.ts`), que chama `authClient.send('authenticate', ...)`.
export const AUTH_SERVICE = 'auth'

// payments — cliente: `reservations` (`reservations.module.ts`); consumidor:
// `ReservationsService` (`paymentsService.send('create_charge', ...)`).
export const PAYMENTS_SERVICE = 'payments';

// notifications — cliente: `payments` (`payments.module.ts`); consumidor:
// `PaymentsService` (`notificationService.emit('notify_email', ...)`).
// Note que `payments` é servidor de `reservations` E cliente de `notifications`.
export const NOTIFICATIONS_SERVICE = 'notifications';
