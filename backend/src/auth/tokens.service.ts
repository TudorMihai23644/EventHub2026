import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { AuthToken, AuthTokenKind } from './auth-token.entity';

/** Cât e valabil un link. Orele se calculează în baza de date (un singur ceas, vezi OutboxWorker). */
export const TOKEN_TTL: Record<AuthTokenKind, string> = {
  PASSWORD_RESET: '30 minutes',
  EMAIL_VERIFY: '24 hours',
};

export const hashToken = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex');

@Injectable()
export class TokensService {
  /**
   * Creează un link nou și îl anulează pe cel nefolosit de același tip (un singur link valabil odată).
   * Întoarce token-ul în clar: merge doar în email, nu se salvează nicăieri.
   */
  async issue(m: EntityManager, userId: string, kind: AuthTokenKind): Promise<string> {
    await this.revokeAll(m, userId, kind);
    const raw = randomBytes(32).toString('base64url');
    await m.insert(AuthToken, {
      userId,
      kind,
      tokenHash: hashToken(raw),
      expiresAt: () => `now() + interval '${TOKEN_TTL[kind]}'`,
    });
    return raw;
  }

  /**
   * Folosește un link: valid doar dacă există, e de tipul cerut, nefolosit și neexpirat.
   * Îl marchează folosit în aceeași tranzacție (cu lock), deci nu poate fi folosit de două ori nici în paralel.
   */
  async consume(m: EntityManager, raw: string, kind: AuthTokenKind): Promise<AuthToken | null> {
    if (typeof raw !== 'string' || !raw) return null;
    const token = await m
      .createQueryBuilder(AuthToken, 't')
      .setLock('pessimistic_write')
      .where('t.tokenHash = :h', { h: hashToken(raw) })
      .andWhere('t.kind = :kind', { kind })
      .andWhere('t.usedAt IS NULL')
      .andWhere('t.expiresAt > now()')
      .getOne();
    if (!token) return null;
    await m.update(AuthToken, { id: token.id }, { usedAt: () => 'now()' });
    return token;
  }

  async revokeAll(m: EntityManager, userId: string, kind: AuthTokenKind) {
    await m.update(AuthToken, { userId, kind, usedAt: IsNull() }, { usedAt: () => 'now()' });
  }
}
