import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListEventsQuery, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from './event.dto';

// Ca în ValidationPipe: parametrii din URL sunt text, se transformă, apoi se validează.
async function parse(query: Record<string, string>) {
  const dto = plainToInstance(ListEventsQuery, query);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  const fields = Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})[0]]));
  return { dto, fields };
}

describe('ListEventsQuery', () => {
  it('folosește pagina 1 și limita implicită când lipsesc', async () => {
    const { dto, fields } = await parse({});
    expect(fields).toEqual({});
    expect(dto).toMatchObject({ page: 1, limit: PAGE_SIZE_DEFAULT });
  });

  it('transformă textul din URL în numere', async () => {
    const { dto, fields } = await parse({ page: '3', limit: '10' });
    expect(fields).toEqual({});
    expect(dto).toMatchObject({ page: 3, limit: 10 });
  });

  it.each([
    [{ page: '0' }, 'page', 'Pagina minimă este 1.'],
    [{ page: '1.5' }, 'page', 'Pagina trebuie să fie un număr întreg.'],
    [{ page: 'abc' }, 'page', 'Pagina trebuie să fie un număr întreg.'],
    [{ limit: '0' }, 'limit', 'Limita minimă este 1.'],
    [{ limit: 'abc' }, 'limit', 'Limita trebuie să fie un număr întreg.'],
    [{ limit: String(PAGE_SIZE_MAX + 1) }, 'limit', `Limita maximă este ${PAGE_SIZE_MAX} de evenimente pe pagină.`],
    [{ search: 'x'.repeat(101) }, 'search', 'Căutarea poate avea maximum 100 de caractere.'],
  ])('%j -> eroare pe %s', async (query, field, message) => {
    const { fields } = await parse(query);
    expect(fields[field]).toBe(message);
  });

  it('acceptă limita maximă și căutarea de 100 de caractere', async () => {
    const { fields } = await parse({ limit: String(PAGE_SIZE_MAX), search: 'x'.repeat(100) });
    expect(fields).toEqual({});
  });
});
