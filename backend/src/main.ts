import 'dotenv/config'; // încarcă backend/.env la rularea locală
import './instrument'; // Sentry (doar cu SENTRY_DSN), înaintea celorlalte module
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
import { uploadsDir } from './images/images.module';
import { corsOrigins, listenPort } from './common/urls';

async function bootstrap() {
  // rawBody: webhook-ul Stripe se verifică pe octeții exacți primiți (JSON-ul reparsat n-ar mai avea aceeași semnătură)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const docs = swaggerEnabled();

  // În spatele unui reverse proxy, IP-ul real vine din X-Forwarded-For (necesar pentru limitarea cererilor).
  const trustProxy = trustProxySetting(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  // Antete de securitate. CSP este oprit doar cât timp Swagger UI este activ (are scripturi inline).
  app.use(helmet({ contentSecurityPolicy: docs ? false : undefined }));

  // Imaginile de copertă din stocarea locală, la /api/uploads/. Numele sunt unice (uuid), deci rămân în cache un an.
  // helmet pune implicit Cross-Origin-Resource-Policy: same-origin, care ar bloca <img> pe frontend (alt port / subdomeniu);
  // imaginile sunt publice, deci aici permitem orice origine.
  app.useStaticAssets(uploadsDir(), {
    prefix: `/${API_PREFIX}/uploads/`,
    index: false,
    dotfiles: 'deny',
    maxAge: '365d',
    immutable: true,
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  });

  app.setGlobalPrefix(API_PREFIX);
  // Cookie-ul de refresh (httpOnly) se citește din cereri; CORS permite credențiale doar pentru originile frontend-ului
  // (CORS_ORIGIN sau, implicit, APP_URL; vezi common/urls.ts).
  app.use(cookieParser());
  app.enableCors({ origin: corsOrigins(), credentials: true });
  app.useGlobalPipes(createValidationPipe()); // mesaje câmp cu câmp, vezi common/validation.ts
  // Documentația interactivă: <PUBLIC_API_URL>/docs, ex. http://localhost:5200/api/docs (doar dacă SWAGGER_ENABLED / în afara producției)
  if (docs) {
    const docConfig = new DocumentBuilder().setTitle('EventHub API').setVersion('1.0').addBearerAuth().addSecurityRequirements('bearer').build();
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, docConfig), {
      swaggerOptions: { persistAuthorization: true }, // token-ul rămâne după reîncărcarea paginii
    });
  }

  // Port ocupat: un mesaj clar în loc de un stack trace (de obicei o altă instanță a API-ului sau alt program)
  const port = listenPort();
  await app.listen(port).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Portul ${port} este deja folosit (altă instanță a API-ului sau alt program). Oprește-l sau pornește cu PORT=<alt port>.`);
      process.exit(1);
    }
    throw e;
  });
}
bootstrap();
