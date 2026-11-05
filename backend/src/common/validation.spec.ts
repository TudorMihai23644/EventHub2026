import { Body, Controller, Get, INestApplication, Patch, Post, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createValidationPipe, firstMessage } from './validation';
import { CreateEventDto, ListEventsQuery, UpdateEventDto } from '../events/dto/event.dto';

describe('firstMessage', () => {
  it('raportează întâi regulile de tip / lipsă, indiferent de ordinea decoratorilor', () => {
    expect(firstMessage({ max: 'prea mare', min: 'prea mic', isInt: 'nu e întreg' })).toBe('nu e întreg');
    expect(firstMessage({ maxLength: 'prea lung', isString: 'obligatoriu' })).toBe('obligatoriu');
    expect(firstMessage({ isInt: 'nu e întreg', isDefined: 'lipsește' })).toBe('lipsește');
  });

  it('altfel ia primul mesaj, iar fără reguli încălcate nu întoarce nimic', () => {
    expect(firstMessage({ min: 'prea mic', max: 'prea mare' })).toBe('prea mic');
    expect(firstMessage({})).toBeUndefined();
    expect(firstMessage(undefined)).toBeUndefined();
  });
});

// Controller de test cu aceleași DTO-uri și același ValidationPipe ca aplicația.
@Controller('events')
class FakeEventsController {
  @Get()
  list(@Query() q: ListEventsQuery) {
    return q;
  }

  @Post()
  create(@Body() dto: CreateEventDto) {
    return dto;
  }

  @Patch()
  update(@Body() dto: UpdateEventDto) {
    return dto;
  }
}

describe('Validarea prin ValidationPipe (ca în API)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [FakeEventsController] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });
  afterAll(() => app.close());

  const valid = {
    title: 'Concert', description: 'Descriere suficient de lungă', location: 'Brașov',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(), capacity: 50, category: 'CONCERT',
  };
  const fieldError = async (method: 'post' | 'patch', body: object, field: string) => {
    const res = await request(app.getHttpServer())[method]('/events').send(body);
    expect(res.status).toBe(400);
    return res.body.fields[field];
  };

  describe('POST (creare)', () => {
    it.each([
      [null, 'Capacitatea este obligatorie.'],
      ['abc', 'Capacitatea trebuie să fie un număr întreg.'],
      [1.5, 'Capacitatea trebuie să fie un număr întreg.'],
      [0, 'Capacitatea minimă este 1 loc.'],
      [100001, 'Capacitatea maximă este 100.000 de locuri.'],
    ])('capacity=%j -> %s', async (capacity, message) => {
      expect(await fieldError('post', { ...valid, capacity }, 'capacity')).toBe(message);
    });

    it('capacitatea lipsă -> obligatorie', async () => {
      const { capacity: _omit, ...withoutCapacity } = valid;
      expect(await fieldError('post', withoutCapacity, 'capacity')).toBe('Capacitatea este obligatorie.');
    });

    it('titlul lipsă -> „obligatoriu”, nu „maximum 120 de caractere”', async () => {
      const { title: _omit, ...withoutTitle } = valid;
      expect(await fieldError('post', withoutTitle, 'title')).toBe('Titlul este obligatoriu.');
    });

    it('un eveniment valid trece', async () => {
      await request(app.getHttpServer()).post('/events').send(valid).expect(201);
    });

    it('categoria: obligatorie și doar din listă', async () => {
      const { category: _omit, ...without } = valid;
      expect(await fieldError('post', without, 'category')).toBe('Alege o categorie.');
      expect(await fieldError('post', { ...valid, category: 'PETRECERE' }, 'category')).toBe('Alege o categorie din listă.');
    });

    it.each([
      ['http://zoom.us/j/1', 'nu https'],
      ['javascript:alert(1)', 'javascript:'],
      ['zoom.us/j/1', 'fără protocol'],
      ['https://', 'incomplet'],
    ])('onlineUrl %j (%s) → respins', async (onlineUrl) => {
      expect(await fieldError('post', { ...valid, format: 'ONLINE', onlineUrl }, 'onlineUrl'))
        .toBe('Linkul trebuie să fie o adresă care începe cu https://.');
    });

    it('format necunoscut și oră de sfârșit invalidă → mesaje pe câmp', async () => {
      expect(await fieldError('post', { ...valid, format: 'PE_LUNA' }, 'format')).toBe('Formatul trebuie să fie fizic, online sau hibrid.');
      expect(await fieldError('post', { ...valid, endsAt: 'mâine' }, 'endsAt')).toBe('Ora de sfârșit nu este validă.');
    });

    it('fără locație trece de DTO (regula „locație obligatorie” depinde de format și e verificată în serviciu)', async () => {
      const { location: _omit, ...without } = valid;
      await request(app.getHttpServer()).post('/events').send({ ...without, format: 'ONLINE', onlineUrl: 'https://meet.example.ro/abc' }).expect(201);
    });
  });

  describe('PATCH (editare)', () => {
    it('capacity: null -> 400 „obligatorie” (înainte trecea și dădea 500 la salvare)', async () => {
      expect(await fieldError('patch', { capacity: null }, 'capacity')).toBe('Capacitatea este obligatorie.');
    });

    it('title: null -> 400 „obligatoriu”', async () => {
      expect(await fieldError('patch', { title: null }, 'title')).toBe('Titlul este obligatoriu.');
    });

    it('câmpurile lipsă rămân opționale', async () => {
      await request(app.getHttpServer()).patch('/events').send({}).expect(200);
      await request(app.getHttpServer()).patch('/events').send({ capacity: 20 }).expect(200);
    });
  });

  describe('GET (listare)', () => {
    it('?page=abc -> „trebuie să fie un număr întreg”', async () => {
      const res = await request(app.getHttpServer()).get('/events?page=abc').expect(400);
      expect(res.body.fields.page).toBe('Pagina trebuie să fie un număr întreg.');
    });
  });
});
