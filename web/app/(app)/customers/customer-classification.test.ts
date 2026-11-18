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
    const historic = { address: 'Hermosillo, Sonora' };
    expect(customerLocationLabel(historic)).toBe('Sin ubicación');
    expect(customerLocationKey(historic)).toBe('__UNLOCATED__');
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
