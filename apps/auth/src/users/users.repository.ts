import { Injectable, Logger } from "@nestjs/common";
import { CreateUserDto } from "../dto/create-user.dto.js";
import { AbstractRepository } from "@app/common/database/abstract.repository.js";
import { UserDocument } from "./models/users.schema.js";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

@Injectable()
export class UsersRepository extends AbstractRepository<UserDocument> {
    protected readonly logger = new Logger(UsersRepository.name);

    // Implementa o inject do model de reserva no construtor da classe abstrata (super)
    constructor(
        @InjectModel(UserDocument.name)
        userModel: Model<UserDocument>
    ) {
        super(userModel);
    }
}