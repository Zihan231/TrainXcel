import { Injectable, OnModuleInit, ConflictException, UnauthorizedException, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async signToken(userId: string, role: string): Promise<string> {
    return this.jwtService.sign({ userId, role });
  }

  async onModuleInit() {
    await this.seedDemoUsers();
  }

  private async generateNextUserId(): Promise<string> {
    const lastUser = await this.userRepository.findOne({
      where: {},
      order: { id: 'DESC' },
    });
    if (!lastUser || !lastUser.userId) {
      return 'TX-0001';
    }
    const match = lastUser.userId.match(/TX-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `TX-${String(nextNum).padStart(4, '0')}`;
  }

  private async seedDemoUsers() {
    const userCount = await this.userRepository.count();
    if (userCount === 0) {
      this.logger.log('No users found. Seeding demo users...');
      
      const defaultPassword = 'password123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      const demoUsers = [
        {
          userId: 'TX-0001',
          email: 'user@example.com',
          name: 'Regular User',
          password: hashedPassword,
          role: 'user',
          phoneNumber: '1234567890',
          address: '123 Main St, Springfield',
        },
        {
          userId: 'TX-0002',
          email: 'employee@example.com',
          name: 'Employee User',
          password: hashedPassword,
          role: 'employee',
          phoneNumber: '0987654321',
          address: '456 Tech Park, Redmond',
        },
        {
          userId: 'TX-0003',
          email: 'admin@example.com',
          name: 'Admin User',
          password: hashedPassword,
          role: 'admin',
          phoneNumber: '5551234567',
          address: '789 Executive Blvd, Cupertino',
        },
      ];

      for (const userData of demoUsers) {
        const user = this.userRepository.create(userData);
        await this.userRepository.save(user);
        this.logger.log(`Seeded user: ${user.email} (UserId: ${user.userId}, Role: ${user.role})`);
      }
      this.logger.log('Demo users seeding completed successfully!');
    } else {
      this.logger.log('Database already has users. Skipping demo users seeding.');
    }
  }

  async register(registerDto: RegisterDto): Promise<{ user: Omit<User, 'password'>; token: string }> {
    const existingUser = await this.userRepository.findOne({ where: { email: registerDto.email } });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const userId = await this.generateNextUserId();
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const newUser = this.userRepository.create({
      ...registerDto,
      userId,
      password: hashedPassword,
    });

    const savedUser = await this.userRepository.save(newUser);
    const token = await this.signToken(savedUser.userId, savedUser.role);
    const { password, ...result } = savedUser;
    return { user: result, token };
  }

  async login(loginDto: LoginDto): Promise<{ user: Omit<User, 'password'>; token: string }> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        userId: true,
        role: true,
        phoneNumber: true,
        address: true,
      }, // Explicitly fetch password
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.signToken(user.userId, user.role);
    const { password, ...result } = user;
    return { user: result, token };
  }

  async getUserProfile(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    const { password, ...result } = user;
    return result;
  }

  async updateUserDetails(userId: string, updateUserDto: UpdateUserDto): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    Object.assign(user, updateUserDto);
    const saved = await this.userRepository.save(user);
    const { password, ...result } = saved;
    return result;
  }

  async updateUserRole(userId: string, role: string, adminUserId: string): Promise<Omit<User, 'password'>> {
    const adminUser = await this.userRepository.findOne({ where: { userId: adminUserId } });
    if (!adminUser) {
      throw new NotFoundException(`Admin user with ID ${adminUserId} not found`);
    }
    if (adminUser.role !== 'admin') {
      throw new ForbiddenException('Only admin users can modify user roles');
    }
    if (role !== 'user' && role !== 'employee' && role !== 'admin') {
      throw new BadRequestException('Invalid role name. Must be user, employee, or admin');
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    user.role = role;
    const saved = await this.userRepository.save(user);
    const { password, ...result } = saved;
    return result;
  }

  async searchUsers(query: string): Promise<Omit<User, 'password'>[]> {
    const users = await this.userRepository.find({
      where: [
        { name: Like(`%${query}%`) },
        { email: Like(`%${query}%`) },
        { role: Like(`%${query}%`) },
        { userId: Like(`%${query}%`) },
      ],
    });
    return users.map(({ password, ...userWithoutPassword }) => userWithoutPassword);
  }

  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    const users = await this.userRepository.find();
    return users.map(({ password, ...userWithoutPassword }) => userWithoutPassword);
  }

  async getUsersPaginated(page: number = 1, limit: number = 10): Promise<{ data: Omit<User, 'password'>[]; meta: any }> {
    const skippedItems = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userRepository.find({
        skip: skippedItems,
        take: limit,
        order: {
          id: 'ASC',
        },
      }),
      this.userRepository.count(),
    ]);

    const data = users.map(({ password, ...userWithoutPassword }) => userWithoutPassword);
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }
}
