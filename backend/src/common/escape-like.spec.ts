import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it.each([
    ['concert', 'concert'],
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['C:\\', 'C:\\\\'],
    ['%_\\', '\\%\\_\\\\'],
    ['Brașov', 'Brașov'],
  ])('%j -> %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});
