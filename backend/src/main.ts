import 'dotenv/config'; // încarcă backend/.env la rularea locală
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/routes';
import { swaggerEnabled, trustProxySetting } from './common/security';

// Erorile de validare returnează și un obiect `fields` ({ câmp: mesaj }),
// ca frontend-ul să le afișeze lângă fiecare câmp, fără reguli proprii.
function validationErrors(errors: ValidationError[]) {
  const fields: Record<string, string> = {};
  for (const e of errors) {
    const msg = Object.values(e.constraints ?? {})[0];
    if (msg) fields[e.property] = msg;
  }
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: Object.values(fields),
    fields,
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const docs = swaggerEnabled();

  // În spatele unui reverse proxy, IP-ul real vine din X-Forwarded-For (necesar pentru limitarea cererilor).
  const trustProxy = trustProxySetting(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  // Antete de securitate. CSP este oprit doar cât timp Swagger UI este activ (are scripturi inline).
  app.use(helmet({ contentSecurityPolicy: docs ? false : undefined }));

  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationErrors,
    }),
  );
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
