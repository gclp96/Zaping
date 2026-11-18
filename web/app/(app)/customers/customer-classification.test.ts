import { describe, expect, it } from 'vitest';

import {
  customerLocationKey,
  customerLocationLabel,
  customerTypeLabel,
  resolveCustomerType,
} from './customer-classification';

describe('Customer classification and location', () => {
  it('renders known historic spellings without mutating their stored values', () => {
    expect(resolveCustomerType('Clínica')).toBe('CLINIC');
    expect(resolveCustomerType('HOSPITAL')).toBe('HOSPITAL');
    expect(customerTypeLabel('CLINIC')).toBe('Clínica');
    expect(customerTypeLabel('Licitación')).toBe('Por clasificar');
    expect(resolveCustomerType(null)).toBeNull();
  });

  it('never guesses a city or state from the legacy address', () => {
    const historic = { address: 'Hermosillo, Sonora', city: undefined };
    expect(customerLocationLabel(historic)).toBe('Sin ubicación');
    expect(customerLocationKey(historic)).toBe('__UNLOCATED__');
  });

  it('uses municipality before state when city is unknown, including filters', () => {
    const acateno = {
      city: null,
      municipality: 'Acateno',
      state: 'Puebla',
      countryCode: 'MX',
    };
    expect(customerLocationLabel(acateno)).toBe('Acateno, Puebla');
    expect(customerLocationKey(acateno)).toBe('ACATENO|PUEBLA|MX');

    const withoutMunicipality = {
      city: null,
      municipality: null,
      state: 'Puebla',
      countryCode: 'MX',
    };
    expect(customerLocationLabel(withoutMunicipality)).toBe('Puebla');
    expect(customerLocationKey(withoutMunicipality)).toBe('|PUEBLA|MX');

    const cityWins = {
      city: 'La Paz',
      municipality: 'La Paz',
      state: 'Baja California Sur',
      countryCode: 'MX',
    };
    expect(customerLocationLabel(cityWins)).toBe('La Paz, Baja California Sur');
    expect(customerLocationKey(cityWins)).toBe('LA_PAZ|BAJA_CALIFORNIA_SUR|MX');

    expect(
      customerLocationLabel({ municipality: 'Acateno', city: null }),
    ).toBe('Acateno');
    expect(customerLocationKey({ municipality: 'Acateno' })).toBe('ACATENO||');
  });

  it('normalizes location filters while displaying proper accents', () => {
    const location = {
      city: 'Ciudad Obregón',
      state: 'Sonora',
      countryCode: 'MX',
    };
    expect(customerLocationLabel(location)).toBe('Ciudad Obregón, Sonora');
    expect(customerLocationKey(location)).toBe('CIUDAD_OBREGON|SONORA|MX');
    expect(
      customerLocationLabel({
        city: 'Los Angeles',
        state: 'California',
        countryCode: 'US',
      }),
    ).toBe('Los Angeles, California (US)');
  });
});
