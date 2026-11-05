import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Event } from '../events/event.entity';
import { ImageRejected, processCover } from './image-processing';
import { ImageStorage, StoredImage } from './image-storage';

/** Ce se salvează în `events.coverImage`. */
export interface CoverImage {
  storage: 'local' | 'cloudinary';
  large: StoredImage;
  small: StoredImage;
}

/** Ce primește clientul: doar adresele (relative pentru stocarea locală, absolute https pentru Cloudinary). */
export const coverView = (c: CoverImage | null | undefined) => (c ? { small: c.small.url, large: c.large.url } : null);

@Injectable()
export class CoverService {
  private readonly logger = new Logger('Covers');

  constructor(private readonly dataSource: DataSource, private readonly storage: ImageStorage) {}

  /** Imagine nouă: procesată, salvată, apoi pusă pe eveniment; imaginea veche se șterge după. */
  async set(organizerId: string, eventId: string, upload: Buffer) {
    await this.owned(organizerId, eventId);
    let variants: Awaited<ReturnType<typeof processCover>>;
    try {
      variants = await processCover(upload);
    } catch (e) {
      if (e instanceof ImageRejected) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: e.message, fields: { cover: e.message } });
      throw e;
    }
    const id = randomUUID();
    const saved: StoredImage[] = [];
    try {
      const large = await this.storage.save(variants.large, `${id}-large`);
      saved.push(large);
      const small = await this.storage.save(variants.small, `${id}-small`);
      saved.push(small);
      const cover: CoverImage = { storage: this.storage.name, large, small };
      const previous = await this.swap(eventId, cover);
      await this.discard(previous);
      return coverView(cover);
    } catch (e) {
      // ceva a eșuat după ce fișierele noi au fost scrise: nu le lăsăm orfane
      for (const s of saved) await this.storage.remove(s.key).catch(() => undefined);
      throw e;
    }
  }

  async remove(organizerId: string, eventId: string) {
    await this.owned(organizerId, eventId);
    await this.discard(await this.swap(eventId, null));
  }

  /** Șterge fișierele unei coperte (după ce nu mai e folosită). O eroare se scrie în log, nu oprește cererea. */
  async discard(cover: CoverImage | null | undefined) {
    if (!cover) return;
    if (cover.storage !== this.storage.name) {
      this.logger.warn(`Copertă din stocarea „${cover.storage}”, configurată acum „${this.storage.name}”: fișierele nu au fost șterse.`);
      return;
    }
    for (const v of [cover.large, cover.small]) {
      await this.storage.remove(v.key).catch((e) => this.logger.warn(`Fișierul ${v.key} nu a putut fi șters: ${e}`));
    }
  }

  /** Înlocuiește coperta sub lock (două încărcări simultane nu lasă fișiere orfane). Întoarce coperta veche. */
  private swap(eventId: string, cover: CoverImage | null): Promise<CoverImage | null> {
    return this.dataSource.transaction(async (m) => {
      const event = await m.findOne(Event, { where: { id: eventId }, lock: { mode: 'pessimistic_write' } });
      if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
      const previous = event.coverImage ?? null;
      await m.update(Event, { id: eventId }, { coverImage: cover as never });
      return previous;
    });
  }

  private async owned(organizerId: string, eventId: string) {
    const event = await this.dataSource.getRepository(Event).findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Doar organizatorul evenimentului îl poate modifica.');
    return event;
  }
}
