import { randomBytes, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import { hashToken } from './tokens.service';
import { RefreshDecision, SESSION_MAX_DAYS, decideRefresh, nextRefreshExpiry } from './session-policy';

export interface IssuedRefresh {
  raw: string; // merge doar în cookie
  expiresAt: Date;
}

export interface RefreshResult {
  decision: RefreshDecision;
  userId?: string;
  /** Doar la 'rotate': noul refresh token (cookie nou). La 'grace' browserul îl are deja pe cel nou. */
  refresh?: IssuedRefresh;
}

// Ceasul bazei de date (aceeași lecție ca în OutboxWorker: un singur ceas pentru toate comparațiile).
const dbNow = async (m: EntityManager): Promise<Date> => (await m.query('SELECT now() AS now'))[0].now;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger('Sessions');

  constructor(private readonly dataSource: DataSource) {}

  /** O autentificare nouă (login / înregistrare): o familie nouă, valabilă cel mult 90 de zile. */
  async start(userId: string, userAgent?: string, m: EntityManager = this.dataSource.manager): Promise<IssuedRefresh> {
    const now = await dbNow(m);
    const familyExpiresAt = new Date(now.getTime() + SESSION_MAX_DAYS * 86_400_000);
    return this.insert(m, userId, randomUUID(), now, familyExpiresAt, userAgent);
  }

  /**
   * Reînnoirea sesiunii cu refresh token-ul din cookie. Lock pe rândul token-ului: două cereri simultane
   * cu același cookie se execută pe rând; a doua vede token-ul „tocmai înlocuit” și primește 'grace'.
   */
  async refresh(raw: string | undefined, userAgent?: string): Promise<RefreshResult> {
    if (!raw || typeof raw !== 'string') return { decision: 'invalid' };
    return this.dataSource.transaction(async (m) => {
      const now = await dbNow(m);
      const token = await m
        .createQueryBuilder(RefreshToken, 't')
        .setLock('pessimistic_write')
        .where('t.tokenHash = :h', { h: hashToken(raw) })
        .getOne();
      const decision = decideRefresh(token, now);
      if (decision === 'invalid') return { decision };
      if (decision === 'theft') {
        await this.revokeFamily(m, token!.familyId);
        this.logger.warn(`Refresh token refolosit după rotație (posibil furt): sesiunea ${token!.familyId} a fost revocată.`);
        return { decision };
      }
      await m.update(RefreshToken, { id: token!.id }, { lastUsedAt: now, ...(decision === 'rotate' ? { replacedAt: now } : {}) });
      if (decision === 'grace') return { decision, userId: token!.userId };
      const next = await this.insert(m, token!.userId, token!.familyId, now, token!.familyExpiresAt, userAgent);
      return { decision, userId: token!.userId, refresh: next };
    });
  }

  /** Logout: revocă sesiunea (familia) căreia îi aparține token-ul din cookie. Token necunoscut: nimic de făcut. */
  async revokeByRaw(raw: string | undefined) {
    if (!raw || typeof raw !== 'string') return;
    const token = await this.dataSource.getRepository(RefreshToken).findOne({ where: { tokenHash: hashToken(raw) } });
    if (token) await this.revokeFamily(this.dataSource.manager, token.familyId);
  }

  async revokeFamily(m: EntityManager, familyId: string) {
    await m.update(RefreshToken, { familyId, revokedAt: IsNull() }, { revokedAt: () => 'now()' });
  }

  /** Toate sesiunile contului (logout pe toate dispozitivele, resetare de parolă). */
  async revokeAllForUser(m: EntityManager, userId: string) {
    await m.update(RefreshToken, { userId, revokedAt: IsNull() }, { revokedAt: () => 'now()' });
  }

  /** Zilnic la 03:00: șterge token-urile expirate sau revocate de mai mult de 7 zile. */
  @Cron('0 3 * * *', { name: 'refresh-token-cleanup' })
  async cleanup(): Promise<number> {
    const res = await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(RefreshToken)
      .where(`"expiresAt" < now() - interval '7 days'`)
      .orWhere(`"familyExpiresAt" < now() - interval '7 days'`)
      .orWhere(`"revokedAt" < now() - interval '7 days'`)
      .execute();
    if (res.affected) this.logger.log(`${res.affected} refresh token-uri vechi șterse.`);
    return res.affected ?? 0;
  }

  private async insert(m: EntityManager, userId: string, familyId: string, now: Date, familyExpiresAt: Date, userAgent?: string) {
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = nextRefreshExpiry(now, familyExpiresAt);
    await m.insert(RefreshToken, {
      userId, familyId, expiresAt, familyExpiresAt,
      tokenHash: hashToken(raw),
      userAgent: userAgent ? userAgent.slice(0, 200) : null,
    });
    return { raw, expiresAt };
  }
}
