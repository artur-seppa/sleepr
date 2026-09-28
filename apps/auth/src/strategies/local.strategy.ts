import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { UsersService } from "../users/users.service.js";

/**
 * Strategy Passport `'local'` — valida login por **email + senha** vindos no body.
 *
 * - `PassportStrategy(Strategy)` (onde `Strategy` é o do pacote `passport-local`)
 *   é um mixin: ao ser instanciada pelo Nest, esta classe se **registra no
 *   Passport com o nome `'local'`**. É esse nome que o {@link LocalAuthGuard}
 *   (`AuthGuard('local')`) procura.
 * - `@Injectable()` + estar em `providers: [LocalStrategy]` no {@link AuthModule}
 *   é o que faz o Nest instanciar a classe (e, portanto, registrar a strategy).
 *
 * `super({ usernameField: 'email' })` — por padrão o `passport-local` lê o
 * identificador do campo `username`. Aqui a gente diz para ler de `email`.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private usersService: UsersService) {
        super({ usernameField: "email" });
    }

    /**
     * Callback que o `passport-local` chama com as credenciais já extraídas do
     * body. O que for **retornado** aqui vira `request.user`.
     * Se as credenciais forem inválidas, lança `401` e o guard barra a request.
     */
    async validate(email: string, password: string): Promise<any> {
        try {
            return await this.usersService.verifyUser(email, password);
        } catch (error) {
            throw new UnauthorizedException('Invalid credentials');
        }
    }
}
