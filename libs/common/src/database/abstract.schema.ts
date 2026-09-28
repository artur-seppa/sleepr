import { Prop, Schema } from "@nestjs/mongoose";
import { SchemaTypes, Types } from "mongoose";

@Schema()
export class AbstractSchema {
  // Define any common properties or methods for your schemas here. We use this schema on abstract repository to ensure that all schemas have an _id of type ObjectId.
  @Prop({ type: SchemaTypes.ObjectId})
  _id: Types.ObjectId;
}