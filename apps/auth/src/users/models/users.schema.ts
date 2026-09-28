import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { AbstractSchema } from "@app/common/database/abstract.schema.js";

@Schema({ versionKey: false })
export class UserDocument extends AbstractSchema {
    @Prop()
    email: string;

    @Prop()
    password: string;
}

export const UsersSchema = SchemaFactory.createForClass(UserDocument);