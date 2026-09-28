import { Model, Types, UpdateQuery, QueryFilter } from "mongoose";
import { AbstractSchema } from "./abstract.schema.js";
import { Logger, NotFoundException } from "@nestjs/common";

export abstract class AbstractRepository<T extends AbstractSchema> {
  protected abstract readonly logger: Logger;
  
  // Inicializa o repository passando um model Mongoose correspondente ao schema genérico T
  constructor(protected readonly model: Model<T>) {}
  
  // Remove o _id do item para que o Mongoose possa gerar um novo _id automaticamente
  async create(item: Omit<T, '_id'>): Promise<T>{
    // new this.model() só monta o documento em memória (aplica defaults/validators do schema),
    // nada é gravado no banco ainda; o save() é quem efetivamente persiste no MongoDB
    const createdItem = new this.model({...item, _id: new Types.ObjectId()});
    return (await createdItem.save()).toJSON() as unknown as T;
  };

  // Busca um item pelo filterQuery fornecido, retornando um array de itens correspondentes
  async findOne(filterQuery: QueryFilter<T>): Promise<T> {
    // lean especifica que buscamos apenas o dado especifico sem metadados do mongoose.
    const item = await this.model.findOne(filterQuery).lean<T>(true);

    if(!item) {
      this.logger.warn(`Item not found for filter: ${JSON.stringify(filterQuery)}`);
      throw new NotFoundException(`Item not found for filter: ${JSON.stringify(filterQuery)}`);
    }

    return item;
  }

  // Busca um item pelo filterQuery fornecido, atualizando-o com os dados do update fornecido, e retornando o item atualizado
  async findOneAndUpdate(filterQuery: QueryFilter<T>, update: UpdateQuery<T>): Promise<T> {
    const item = await this.model.findOneAndUpdate(filterQuery, update, { new: true }).lean<T>(true);

    if(!item) {
      this.logger.warn(`Item not found for filter: ${JSON.stringify(filterQuery)}`);
      throw new NotFoundException(`Item not found for filter: ${JSON.stringify(filterQuery)}`);
    }

    return item;
  }

  // Busca todos os itens correspondentes ao filterQuery fornecido, retornando um array de itens correspondentes
  async find(filterQuery: QueryFilter<T>): Promise<T[]> {
    return await this.model.find(filterQuery).lean<T[]>(true);
  }

  // Busca um item pelo filterQuery fornecido, removendo-o do banco de dados e retornando true se a operação foi bem-sucedida
  async findOneAndDelete(filterQuery: QueryFilter<T>): Promise<boolean> {
    const item = await this.model.findOneAndDelete(filterQuery).lean<T>(true);

    if(!item) {
      this.logger.warn(`Item not found for filter: ${JSON.stringify(filterQuery)}`);
      throw new NotFoundException(`Item not found for filter: ${JSON.stringify(filterQuery)}`);
    }

    return true;
  }
}