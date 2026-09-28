import { Type } from "class-transformer";
import { IsDate, IsDefined, IsNotEmptyObject, IsString, ValidateNested } from "class-validator";
import { CreateChargeDto } from "../../../../libs/common/src/dto/create-charge.dto.js"

export class CreateReservationDto {
    // @Type(() => Date) converte a string ISO do JSON em objeto Date (transforma).
    // @IsDate() valida depois, e só passa se o valor já for uma instancia de Date.
    @IsDate()
    @Type(() => Date)
    startDate: Date;

    @IsDate()
    @Type(() => Date)
    endDate: Date;

    @IsDefined()
    @IsNotEmptyObject()
    @ValidateNested()
    @Type(() => CreateChargeDto)
    charge: CreateChargeDto
}
