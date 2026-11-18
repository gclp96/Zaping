export const CUSTOMER_TYPE_OPTIONS = [
  { value: 'HOSPITAL', label: 'Hospital' },
  { value: 'CLINIC', label: 'Clínica' },
  { value: 'DOCTOR', label: 'Médico / Consultorio' },
  { value: 'INDIVIDUAL', label: 'Particular' },
  { value: 'BUSINESS', label: 'Empresa / Distribuidor' },
  { value: 'PUBLIC_INSTITUTION', label: 'Institución pública' },
  { value: 'OTHER', label: 'Otro' },
] as const;

export type CustomerType = (typeof CUSTOMER_TYPE_OPTIONS)[number]['value'];

export type CustomerLocation = {
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
};

const aliases: Record<string, CustomerType> = {
  HOSPITAL: 'HOSPITAL',
  CLINIC: 'CLINIC',
  CLINICA: 'CLINIC',
  DOCTOR: 'DOCTOR',
  MEDICO: 'DOCTOR',
  CONSULTORIO: 'DOCTOR',
  MEDICO_CONSULTORIO: 'DOCTOR',
  INDIVIDUAL: 'INDIVIDUAL',
  PARTICULAR: 'INDIVIDUAL',
  BUSINESS: 'BUSINESS',
  EMPRESA: 'BUSINESS',
  DISTRIBUIDOR: 'BUSINESS',
  EMPRESA_DISTRIBUIDOR: 'BUSINESS',
  PUBLIC_INSTITUTION: 'PUBLIC_INSTITUTION',
  INSTITUCION_PUBLICA: 'PUBLIC_INSTITUTION',
  OTHER: 'OTHER',
  OTRO: 'OTHER',
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s*\/\s*/g, '_')
    .replace(/\s+/g, '_');
}

export function resolveCustomerType(value?: string | null): CustomerType | null {
  if (!value?.trim()) return null;
  return aliases[normalize(value)] ?? null;
}

export function customerTypeLabel(value?: string | null): string {
  const type = resolveCustomerType(value);
  return (
    CUSTOMER_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    'Por clasificar'
  );
}

export function customerLocationLabel(customer: CustomerLocation): string {
  const city = customer.city?.trim();
  const state = customer.state?.trim();
  const code = customer.countryCode?.trim().toUpperCase();
  if (!city && !state) return 'Sin ubicación';
  const main = [city, state].filter(Boolean).join(', ');
  return code && code !== 'MX' ? main + ' (' + code + ')' : main;
}

export function customerLocationKey(customer: CustomerLocation): string {
  const city = customer.city?.trim();
  const state = customer.state?.trim();
  if (!city && !state) return '__UNLOCATED__';
  return [city ?? '', state ?? '', customer.countryCode ?? '']
    .map(normalize)
    .join('|');
}
