import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { AbstractSchema } from "@app/common/database/abstract.schema.js";

@Schema({ versionKey: false })
export class ReservationDocument extends AbstractSchema {
    @Prop()
    timestamp: Date;
    @Prop()
    startDate: Date;
    @Prop()
    endDate: Date;
    @Prop()
    userId: string;
    @Prop()
    invoiceId: string;
}

export const ReservationSchema = SchemaFactory.createForClass(ReservationDocument);