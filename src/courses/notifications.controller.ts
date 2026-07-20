import { Controller, Get, UseGuards, Req, Put, Param, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Notification } from './entities/notification.entity';
import { User } from '../auth/entities/user.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get()
  async getNotifications(@Req() req: any) {
    const user = await this.userRepository.findOne({ where: { userId: req.user.userId } });
    if (!user) return [];

    return this.notificationRepository.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  @Put(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    const user = await this.userRepository.findOne({ where: { userId: req.user.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const notification = await this.notificationRepository.findOne({
      where: { id: +id },
      relations: { user: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.user && notification.user.id !== user.id) {
      throw new ForbiddenException('You do not own this notification');
    }

    notification.isRead = true;
    await this.notificationRepository.save(notification);
    return { success: true };
  }
}
