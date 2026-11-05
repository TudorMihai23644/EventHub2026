// Punctul de intrare pentru CLI-ul TypeORM (npm run migration:*). Nu este importat de aplicație.
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source';

export default new DataSource({ ...dataSourceOptions(), migrationsRun: false });
