import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  findByEmailWithPassword(email: string) {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
  }

  create(data: { name: string; email: string; passwordHash: string; role: Role }) {
    return this.repo.save(this.repo.create(data));
  }
}
