import { Inject, Injectable } from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { UpdateReservationDto } from './dto/update-reservation.dto.js';
import { ReservationRepository } from './reservation.repository.js';
import { timestamp } from 'rxjs/internal/operators/timestamp';
import { PAYMENTS_SERVICE } from '@app/common/constants/services.js';
import { ClientProxy } from '@nestjs/microservices';
import { map } from 'rxjs'
import { UserDto } from '@app/common/dto/user.dto.js';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationsRepository: ReservationRepository,
    @Inject(PAYMENTS_SERVICE) private readonly paymentsService: ClientProxy
  ) { }

  /**
   * Cria a reserva **depois** de cobrar o cartão no microserviço `payments`.
   *
   * Fluxo (ver `docs/11-payments-stripe.md` e `docs/12-notifications-eventos-tcp.md`):
   *
   * 1. `paymentsService.send('create_charge', { ...charge, email })` — chamada TCP
   *    request/response ao `payments`. O `email` vem do usuário autenticado
   *    (`@CurrentUser()` → `UserDto`), NÃO do corpo HTTP; é injetado aqui para o
   *    `payments` poder avisar o usuário por e-mail (via `notifications`) depois
   *    de cobrar. Perceba que `reservations` não fala com `notifications`
   *    direto — só conhece o `payments`, que cuida do resto da cadeia.
   * 2. `map((response) => ...)` — quando o `payments` responde com o
   *    `PaymentIntent`, grava a reserva no Mongo com `invoiceId: response.id`
   *    (o id da cobrança no Stripe), `timestamp` e o `userId` de quem reservou.
   *
   * Retorna o **Observable** (não o resultado): `send` é *cold* — só dispara a
   * chamada TCP quando alguém assina, e quem assina é o Nest ao montar a
   * resposta HTTP do controller. Se a cobrança falhar, o erro do `payments`
   * propaga pelo Observable e a reserva nem chega a ser gravada.
   */
  async create(
    createReservationDto: CreateReservationDto,
    { email, _id: userId }: UserDto
  ) {
    return this.paymentsService.send(
      'create_charge', {
        ...createReservationDto.charge,
        email,
      }
    ).pipe(
      map((response) => {
        return this.reservationsRepository.create({
          ...createReservationDto,
          invoiceId: response.id,
          timestamp: new Date(),
          userId
        });
      })
    )


  }

  async findAll() {
    return this.reservationsRepository.find({});
  }

  async findOne(_id: string) {
    return this.reservationsRepository.findOne({ _id });
  }

  async update(_id: string, updateReservationDto: UpdateReservationDto) {
    return this.reservationsRepository.findOneAndUpdate({ _id }, { $set: updateReservationDto });
  }

  async remove(_id: string) {
    return this.reservationsRepository.findOneAndDelete({ _id });
  }
}
