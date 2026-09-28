import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenPayload } from './interfaces/token-payload.interface.js';
import { UsersService } from './users/users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}
  async login(user: any, response: any) {
    const tokenPayload: TokenPayload = { 
      userId: user._id.toHexString()
    };

    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + (this.configService.get('JWT_EXPIRATION')));

    const token = this.jwtService.sign(tokenPayload);

    response.cookie('Authentication', token, {
      httpOnly: true,
      expires,
    });

  }

  /**
   * Verifica um JWT recebido por TCP e devolve o usuário correspondente.
   *
   * Chamado por `AuthController.authenticate` (`@MessagePattern('authenticate')`),
   * que responde à chamada feita pelo `JWTAuthGuard` de `@app/common` no app
   * `reservations`. Usa o mesmo `JwtService`/`JWT_SECRET` com que `login` assina
   * o token — `jwtService.verify` confere assinatura + expiração e devolve o
   * payload (`{ userId }`); lança se o token for inválido/expirado.
   */
  async verifyToken(jwt: string) {
    const payload = this.jwtService.verify<TokenPayload>(jwt);
    return this.usersService.getUser({ _id: payload.userId });
  }
}
