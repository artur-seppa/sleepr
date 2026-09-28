import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ParseObjectIdPipe } from '@app/common/pipes/parse-object-id.pipe.js';
import { ReservationsService } from './reservations.service.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { UpdateReservationDto } from './dto/update-reservation.dto.js';
import { JWTAuthGuard } from '@app/common/auth/index.js'
import { CurrentUser } from '@app/common/decorators/current-user.decorator.js'
import type { UserDto } from '@app/common/dto/user.dto.js';

/**
 * `@UseGuards(JWTAuthGuard)` em cada rota deste controller usa o `JWTAuthGuard`
 * de `@app/common/auth` (`libs/common/src/auth/jwt-auth.guard.ts`) — NÃO existe
 * `JwtStrategy`/Passport aqui em `reservations`. Em vez disso, o guard lê o
 * cookie `Authentication` da request e faz uma chamada TCP ao microserviço
 * `auth` (`authClient.send('authenticate', ...)`) para validar o token e trazer
 * o usuário de volta. Ver o guard e `reservations.module.ts` (`ClientsModule`)
 * para o transporte, e `docs/08-comunicacao-auth-reservations-tcp.md` para o
 * fluxo completo.
 */
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) { }

  @Post()
  @UseGuards(JWTAuthGuard)
  async create(
    @Body() createReservationDto: CreateReservationDto,
    @CurrentUser() user: UserDto
  ) {
    return this.reservationsService.create(createReservationDto, user);
  }

  @Get()
  @UseGuards(JWTAuthGuard)
  async findAll() {
    return this.reservationsService.findAll();
  }

  @Get(':id')
  @UseGuards(JWTAuthGuard)
  async findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reservationsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JWTAuthGuard)
  async update(@Param('id', ParseObjectIdPipe) id: string, @Body() updateReservationDto: UpdateReservationDto) {
    return this.reservationsService.update(id, updateReservationDto);
  }

  @Delete(':id')
  @UseGuards(JWTAuthGuard)
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reservationsService.remove(id);
  }
}
