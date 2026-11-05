import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { ROUTES } from './common/routes';

// fără limită: healthcheck-ul Docker apelează ruta la fiecare 5 secunde
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get(ROUTES.health)
  async health() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return { status: 'ok', database: 'up', time: new Date().toISOString() };
  }
}
