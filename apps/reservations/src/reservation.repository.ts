import { Injectable, Logger } from "@nestjs/common";
import { ReservationDocument } from "./models/reservation.schema.js";
import { AbstractRepository } from "@app/common/database/abstract.repository.js";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

@Injectable()
export class ReservationRepository extends AbstractRepository<ReservationDocument> {
    protected readonly logger = new Logger(ReservationRepository.name);

    // Implementa o inject do model de reserva no construtor da classe abstrata (super)
    constructor (
        @InjectModel(ReservationDocument.name)
        reservationModel: Model<ReservationDocument>
    ) {
        super(reservationModel);
    }
}