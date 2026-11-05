import * as T from './templates';
import { EventInfo } from './templates';

const cfg = { appUrl: 'https://eventhub.test', timeZone: 'Europe/Bucharest' };
// 1 decembrie 2026, 17:00 UTC = 19:00 la București (UTC+2 iarna)
const event: EventInfo = { id: 'e-1', title: 'Concert de iarnă', startsAt: new Date('2026-12-01T17:00:00Z'), location: 'Sala Patria, Brașov' };

describe('templates', () => {
  it('confirmarea conține titlul, ora din București, locația și linkul', () => {
    const c = T.registrationConfirmed(cfg, { name: 'Ana', event });
    expect(c.subject).toBe('Te-ai înscris la „Concert de iarnă”');
    for (const part of [c.html, c.text]) {
      expect(part).toContain('19:00'); // nu 17:00 (ora UTC a serverului)
      expect(part).toContain('decembrie');
      expect(part).toContain('Sala Patria, Brașov');
      expect(part).toContain('https://eventhub.test/events/e-1');
      expect(part).toContain('Bună, Ana!');
    }
  });

  it('escapează tot ce scrie utilizatorul în HTML', () => {
    const evil = { ...event, title: '<script>alert(1)</script> & <a href="https://rău.ro">click</a>', location: '"><img src=x>' };
    const c = T.registrationConfirmed(cfg, { name: '<b>Ion</b>', event: evil });
    expect(c.html).not.toContain('<script>');
    expect(c.html).not.toContain('<a href="https://rău.ro"');
    expect(c.html).not.toContain('<img');
    expect(c.html).not.toContain('<b>Ion</b>');
    expect(c.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp;');
    expect(c.text).toContain('<script>alert(1)</script>'); // textul simplu nu se interpretează, rămâne cum a fost scris
  });

  it('subiectul nu conține rânduri noi (ar putea strica antetele emailului)', () => {
    const c = T.registrationConfirmed(cfg, { name: 'Ana', event: { ...event, title: 'Titlu\r\nBcc: toti@x.ro' } });
    expect(c.subject).not.toMatch(/[\r\n]/);
    expect(c.subject).toBe('Te-ai înscris la „Titlu Bcc: toti@x.ro”');
  });

  it('id-ul evenimentului din link este codificat', () => {
    const c = T.registrationConfirmed(cfg, { name: 'Ana', event: { ...event, id: 'a b/c' } });
    expect(c.html).toContain('https://eventhub.test/events/a%20b%2Fc');
  });

  describe('eventChanges: doar titlul, data/ora și locația contează', () => {
    it('fără schimbări relevante → nimic', () => {
      expect(T.eventChanges(cfg, event, { ...event })).toEqual([]);
    });

    it('listează vechi → nou pentru fiecare câmp schimbat', () => {
      const after = { ...event, title: 'Concert mutat', startsAt: new Date('2026-12-02T18:30:00Z'), location: 'Cluj' };
      const changes = T.eventChanges(cfg, event, after);
      expect(changes.map(([k]) => k)).toEqual(['Titlu', 'Când', 'Unde']);
      expect(changes[0][1]).toBe('Concert de iarnă → Concert mutat');
      expect(changes[1][1]).toMatch(/19:00 → .*20:30/);
      expect(changes[2][1]).toBe('Sala Patria, Brașov → Cluj');
    });
  });

  it('emailul de modificare arată schimbările', () => {
    const c = T.eventUpdated(cfg, { name: 'Ana', before: event, after: { ...event, location: 'Cluj' } });
    expect(c.text).toContain('Unde: Sala Patria, Brașov → Cluj');
    expect(c.subject).toBe('S-a schimbat evenimentul „Concert de iarnă”');
  });

  it('emailul de anulare spune când era programat', () => {
    const c = T.eventCancelled(cfg, { name: 'Ana', event });
    expect(c.subject).toBe('Evenimentul „Concert de iarnă” a fost anulat');
    expect(c.text).toMatch(/Era programat: .*19:00/);
  });

  it('organizatorul vede cine s-a înscris și câte locuri sunt ocupate', () => {
    const d = { organizerName: 'Maria', participantName: 'Ana Pop', event, taken: 3, capacity: 10 };
    const reg = T.organizerNewRegistration(cfg, d);
    expect(reg.subject).toBe('Înscriere nouă: Ana Pop la „Concert de iarnă”');
    expect(reg.text).toContain('Locuri ocupate: 3 din 10');
    expect(reg.html).toContain('https://eventhub.test/organizator');
    const can = T.organizerCancellation(cfg, { ...d, taken: 2 });
    expect(can.subject).toBe('Anulare: Ana Pop la „Concert de iarnă”');
    expect(can.text).toContain('Locuri ocupate: 2 din 10');
  });

  it('fiecare email are și versiunea text, și HTML complet', () => {
    const all = [
      T.registrationConfirmed(cfg, { name: 'A', event }),
      T.registrationCancelled(cfg, { name: 'A', event }),
      T.eventUpdated(cfg, { name: 'A', before: event, after: { ...event, title: 'X' } }),
      T.eventCancelled(cfg, { name: 'A', event }),
      T.organizerNewRegistration(cfg, { organizerName: 'O', participantName: 'A', event, taken: 1, capacity: 2 }),
      T.organizerCancellation(cfg, { organizerName: 'O', participantName: 'A', event, taken: 0, capacity: 2 }),
    ];
    for (const c of all) {
      expect(c.html).toMatch(/^<!doctype html>/);
      expect(c.html).toContain('<meta charset="utf-8">');
      expect(c.text.length).toBeGreaterThan(20);
      expect(c.text).not.toMatch(/<[a-z]/i);
    }
  });
});
