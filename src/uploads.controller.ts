import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';

@Controller('uploads')
export class UploadsController {
  @Get(':folder/:filename')
  serveFile(@Param('folder') folder: string, @Param('filename') filename: string, @Res() res: express.Response) {
    const filePath = join(process.cwd(), 'uploads', folder, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    return res.sendFile(filePath);
  }
}
