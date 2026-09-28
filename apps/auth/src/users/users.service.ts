import { Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto.js';
import { UsersRepository } from './users.repository.js';
import * as bcrypt from 'bcryptjs';
import { GetUserDto } from '../dto/get-user.dto.js';

@Injectable()
export class UsersService {
    constructor(private readonly usersRepository: UsersRepository) {}

    private async validateCreateUserDto(createUserDto: CreateUserDto){
        try {
            await this.usersRepository.findOne({email: createUserDto.email})
        } catch (error) {
            return
        }

        throw new UnprocessableEntityException('Email already exists.')
    } 

    async create(createUserDto: CreateUserDto) {
        await this.validateCreateUserDto(createUserDto)
        return this.usersRepository.create({
            ...createUserDto,
            password: await bcrypt.hash(createUserDto.password, 10),
        });
    }

    async verifyUser(email: string, password: string): Promise<any> {
        const user = await this.usersRepository.findOne({ email });
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            throw new UnauthorizedException('Invalid credentials');
        }
        
        return user;
    }

    async getUser(getUserDto: GetUserDto){
        return this.usersRepository.findOne(getUserDto)
    }
}
