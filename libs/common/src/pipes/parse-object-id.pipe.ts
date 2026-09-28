import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { Types } from "mongoose";

// Valida se o valor recebido na rota é um ObjectId válido do MongoDB antes de chegar ao service/repository.
// Sem isso, um id inválido só falha lá no cast do Mongoose e vira um erro 500 genérico.
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    // Types.ObjectId.isValid aceita qualquer string de 12 caracteres (ex: "aaaaaaaaaaaa"),
    // então comparamos o round-trip para garantir que é de fato um hex de 24 caracteres.
    if (!Types.ObjectId.isValid(value) || new Types.ObjectId(value).toString() !== value) {
      throw new BadRequestException(`Invalid id: "${value}"`);
    }

    return value;
  }
}
