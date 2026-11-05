import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { ResendMailer } from './resend.mailer';
import { MailerError } from './mailer';
import { createMailer } from './mail.module';
import { LogMailer } from './log.mailer';

// Un server Resend fals, local: ResendMailer face exact aceleași cereri HTTP ca în producție,
// dar nimic nu pleacă de pe calculator.
type Reply = { status: number; body: string; headers?: Record<string, string> };
interface Captured { method?: string; url?: string; headers: IncomingMessage['headers']; body: any }

describe('ResendMailer (pe un server Resend fals)', () => {
  let server: Server;
  let baseUrl: string;
  let reply: Reply;
  let captured: Captured[];

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        captured.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
        res.writeHead(reply.status, { 'Content-Type': 'application/json', ...reply.headers });
        res.end(reply.body);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => (captured = []));

  const cfg = () => ({ apiKey: 're_test_key', from: 'EventHub <onboarding@resend.dev>', appUrl: 'http://app', timeZone: 'Europe/Bucharest', resendBaseUrl: baseUrl });
  const emails = [
    { to: 'ana@test.ro', subject: 'Te-ai înscris la „Concert”', html: '<p>Bună</p>', text: 'Bună' },
    { to: 'ion@test.ro', subject: 'Al doilea', html: '<p>2</p>', text: '2' },
  ];

  it('trimite un singur POST /emails/batch cu cheia, expeditorul și cheia de idempotență', async () => {
    reply = { status: 200, body: JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }) };
    const res = await new ResendMailer(cfg()).sendBatch(emails, 'outbox-abc');

    expect(res).toEqual({ failed: [] });
    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/emails/batch');
    expect(req.headers.authorization).toBe('Bearer re_test_key');
    expect(req.headers['idempotency-key']).toBe('outbox-abc');
    expect(req.headers['x-batch-validation']).toBe('permissive');
    expect(req.body).toEqual(emails.map((e) => ({ from: 'EventHub <onboarding@resend.dev>', ...e })));
  });

  it('o adresă respinsă nu blochează restul: eroarea vine pe index', async () => {
    reply = { status: 200, body: JSON.stringify({ data: [{ id: 'a' }], errors: [{ index: 1, message: 'Invalid `to` field.' }] }) };
    const res = await new ResendMailer(cfg()).sendBatch(emails, 'k');
    expect(res).toEqual({ failed: [{ index: 1, error: 'Invalid `to` field.' }] });
  });

  it('429: aruncă MailerError cu retry-after', async () => {
    reply = {
      status: 429,
      headers: { 'retry-after': '7' },
      body: JSON.stringify({ statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests.' }),
    };
    const err = await new ResendMailer(cfg()).sendBatch(emails, 'k').catch((e) => e);
    expect(err).toBeInstanceOf(MailerError);
    expect(err.retryAfterSeconds).toBe(7);
    expect(err.message).toContain('rate_limit_exceeded');
  });

  it('403 (expeditor resend.dev către altă adresă): MailerError cu mesajul Resend', async () => {
    reply = {
      status: 403,
      body: JSON.stringify({ statusCode: 403, name: 'validation_error', message: 'You can only send testing emails to your own email address.' }),
    };
    const err = await new ResendMailer(cfg()).sendBatch(emails, 'k').catch((e) => e);
    expect(err).toBeInstanceOf(MailerError);
    expect(err.message).toContain('only send testing emails');
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('500 cu răspuns care nu e JSON: MailerError', async () => {
    reply = { status: 500, body: '<html>Bad gateway</html>' };
    await expect(new ResendMailer(cfg()).sendBatch(emails, 'k')).rejects.toBeInstanceOf(MailerError);
  });

  it('serverul nu răspunde deloc: MailerError, nu o excepție necontrolată', async () => {
    const down = { ...cfg(), resendBaseUrl: 'http://127.0.0.1:1' };
    await expect(new ResendMailer(down).sendBatch(emails, 'k')).rejects.toBeInstanceOf(MailerError);
  });
});

describe('createMailer', () => {
  it('fără cheie folosește LogMailer (nu trimite nimic)', () => {
    expect(createMailer({ from: 'x', appUrl: 'x', timeZone: 'UTC' })).toBeInstanceOf(LogMailer);
  });

  it('cu cheie folosește ResendMailer', () => {
    expect(createMailer({ apiKey: 're_x', from: 'x', appUrl: 'x', timeZone: 'UTC' })).toBeInstanceOf(ResendMailer);
  });
});
