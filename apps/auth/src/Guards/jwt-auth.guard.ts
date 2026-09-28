import { AuthGuard } from "@nestjs/passport";

/**
 * Guard que dispara a strategy `'jwt'` ({@link JwtStrategy}).
 * Mesmo padrão do {@link LocalAuthGuard}: `AuthGuard('jwt')` já é um guard
 * completo (roda a strategy, verifica o token via `secretOrKey`, popula
 * `request.user` ou corta com `401`); a subclasse só existe para ter um
 * tipo/nome pra usar em `@UseGuards(JWTAuthGuard)`.
 *
 * Diferença de uso pro `LocalAuthGuard`: este protege rotas que exigem estar
 * **já logado** (lê o cookie `Authentication`), enquanto o `LocalAuthGuard`
 * protege a própria rota de login (lê email/senha do body).
 */
export class JWTAuthGuard extends AuthGuard('jwt') {}
