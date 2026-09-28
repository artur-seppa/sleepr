// Formato do usuário que TRAFEGA entre microserviços via TCP.
// Não é o `UserDocument` (schema do Mongoose) do app `auth` — é uma cópia simples
// (plain object), porque o payload TCP é serializado (JSON), não passa a instância
// real do Mongoose. Usado em dois pontos do app `reservations`:
// - `JWTAuthGuard.canActivate` (`libs/common/src/auth/jwt-auth.guard.ts`) — tipo do
//   retorno esperado de `authClient.send<UserDto>('authenticate', ...)`.
// - `ReservationsController.create` — tipo de `@CurrentUser() user: UserDto`.
export interface UserDto {
    _id: string,
    email: string,
    password: string
}