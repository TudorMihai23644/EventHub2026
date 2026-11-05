import { Logger, Module } from '@nestjs/common';
import { join } from 'path';
import { CoverService } from './cover.service';
import { CloudinaryImageStorage, ImageStorage, LocalImageStorage, parseCloudinaryUrl } from './image-storage';
import { secret } from '../common/secrets';

/** Directorul imaginilor locale (volumul Docker `uploads` este montat aici). */
export const uploadsDir = (env: NodeJS.ProcessEnv = process.env) => env.UPLOADS_DIR?.trim() || join(process.cwd(), 'uploads');

/** Cloudinary dacă e setat CLOUDINARY_URL, altfel disc local. */
export function createImageStorage(env: NodeJS.ProcessEnv = process.env): ImageStorage {
  // CLOUDINARY_URL conține secretul API: se citește ca celelalte secrete (CLOUDINARY_URL_FILE în Docker).
  const cloudinary = parseCloudinaryUrl(secret('CLOUDINARY_URL', false), env.CLOUDINARY_API_BASE?.trim() || undefined);
  const storage = cloudinary ? new CloudinaryImageStorage(cloudinary) : new LocalImageStorage(uploadsDir(env));
  new Logger('Images').log(cloudinary ? `Imaginile se urcă pe Cloudinary (${cloudinary.cloudName}).` : `Imaginile se salvează local în ${uploadsDir(env)}.`);
  return storage;
}

@Module({
  providers: [{ provide: ImageStorage, useFactory: () => createImageStorage() }, CoverService],
  exports: [CoverService],
})
export class ImagesModule {}
