import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, ExtractJwt } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service.js";
import { TokenPayload } from "../interfaces/token-payload.interface.js";

/**
 * Strategy Passport `'jwt'` — autentica pelo cookie `Authentication` em vez de
 * pedir email/senha de novo. Equivalente da {@link LocalStrategy}, só que a
 * "credencial" agora é o JWT que o `POST /auth/login` já deixou no cookie.
 *
 * `PassportStrategy(Strategy)` (o `Strategy` aqui é o de `passport-jwt`) registra
 * esta classe no Passport com o nome `'jwt'` — é esse nome que o
 * {@link JWTAuthGuard} (`AuthGuard('jwt')`) dispara.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private readonly usersService: UsersService
    ) {
        super({
            // COMO extrair o token da request. `ExtractJwt` traz extractors prontos
            // (header Bearer, query param, etc.), mas aqui passamos um extractor
            // CUSTOM: uma função que lê `request.cookies.Authentication`.
            // ⚠️ Esse nome tem que ser IDÊNTICO ao cookie setado no login
            // (`AuthService.login` → `response.cookie('Authentication', token, ...)`).
            // Se os nomes não baterem, isto sempre devolve `undefined` e o guard
            // barra com 401 mesmo com um cookie válido — bug silencioso, o TS não
            // acusa porque pra ele são só strings.
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request: any) => request?.cookies?.Authentication || request?.Authentication,
            ]),
            // Mesmo secret usado pra ASSINAR o token (`JwtModule` no AuthModule).
            // O passport-jwt usa isso para VERIFICAR assinatura + expiração do
            // token ANTES de chamar validate() — essa checagem é automática,
            // a gente não escreve nenhuma linha para ela.
            secretOrKey: configService.getOrThrow<string>('JWT_SECRET')
        })
    }

    /**
     * Só roda se o passport-jwt já validou o token (assinatura ok e não expirado).
     * `payload` é o conteúdo decodificado do JWT — o mesmo objeto assinado em
     * `AuthService.login` (`{ userId }`, ver {@link TokenPayload}).
     *
     * Igual à `LocalStrategy`: o que este método RETORNA é o que o Passport grava
     * em `request.user` (lido depois por {@link CurrentUser}). Aqui a gente busca
     * o usuário completo no banco a partir do `userId` do token — o payload do
     * JWT só carrega o id, não o documento inteiro.
     */
    async validate({ userId }: TokenPayload) {
        return this.usersService.getUser({ _id: userId })
    }
}
