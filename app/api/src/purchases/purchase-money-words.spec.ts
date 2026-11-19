import { moneyToSpanishWordsMXN } from './purchase-money-words';

describe('moneyToSpanishWordsMXN', () => {
  it.each([
    [100448.61, 'CIEN MIL CUATROCIENTOS CUARENTA Y OCHO PESOS 61/100 M.N.'],
    [1, 'UN PESO 00/100 M.N.'],
    [21.2, 'VEINTIÚN PESOS 20/100 M.N.'],
    [100, 'CIEN PESOS 00/100 M.N.'],
    [0, 'CERO PESOS 00/100 M.N.'],
    [1030, 'MIL TREINTA PESOS 00/100 M.N.'],
    [16.04, 'DIECISÉIS PESOS 04/100 M.N.'],
  ])('writes %s as its correct Spanish peso wording', (value, expected) => {
    expect(moneyToSpanishWordsMXN(value)).toBe(expected);
  });

  it.each([-1, Infinity, NaN, 1_000_000_000])(
    'rejects unsupported monetary amount %s',
    (value) => {
      expect(() => moneyToSpanishWordsMXN(value)).toThrow(RangeError);
    },
  );
});
