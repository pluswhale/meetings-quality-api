import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    
    const payload = { email: user.email, sub: user['_id'] };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        _id: user['_id'],
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user['_id'] };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        _id: user['_id'],
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findById(payload.sub);
      
      return {
        user: {
          _id: user['_id'],
          fullName: user.fullName,
          email: user.email,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
