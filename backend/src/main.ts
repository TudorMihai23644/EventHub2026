import 'dotenv/config'; // încarcă backend/.env la rularea locală
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/routes';
import { swaggerEnabled, trustProxySetting } from './common/security';
import { createValidationPipe } from './common/validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const docs = swaggerEnabled();

  // În spatele unui reverse proxy, IP-ul real vine din X-Forwarded-For (necesar pentru limitarea cererilor).
  const trustProxy = trustProxySetting(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  // Antete de securitate. CSP este oprit doar cât timp Swagger UI este activ (are scripturi inline).
  app.use(helmet({ contentSecurityPolicy: docs ? false : undefined }));

  app.setGlobalPrefix(API_PREFIX);
  // Cookie-ul de refresh (httpOnly) se citește din cereri; CORS permite credențiale doar pentru originile din CORS_ORIGIN.
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: true,
  });
  app.useGlobalPipes(createValidationPipe()); // mesaje câmp cu câmp, vezi common/validation.ts
  // Documentația interactivă: http://localhost:3000/api/docs (doar dacă SWAGGER_ENABLED / în afara producției)
  if (docs) {
    const docConfig = new DocumentBuilder().setTitle('EventHub API').setVersion('1.0').addBearerAuth().addSecurityRequirements('bearer').build();
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, docConfig), {
      swaggerOptions: { persistAuthorization: true }, // token-ul rămâne după reîncărcarea paginii
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
