const UNITS = [
  'CERO', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS',
  'SIETE', 'OCHO', 'NUEVE',
];
const TEENS = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
];
const TENS = [
  '', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA',
  'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
];
const HUNDREDS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS',
  'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS',
  'NOVECIENTOS',
];

function lessThanThousand(n: number, beforeNoun = false): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  if (n >= 100) {
    return [
      HUNDREDS[Math.floor(n / 100)],
      lessThanThousand(n % 100, beforeNoun),
    ].filter(Boolean).join(' ');
  }
  if (n < 10) return n === 1 && beforeNoun ? 'UN' : UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n === 20) return 'VEINTE';
  if (n < 30) {
    if (n === 21) return beforeNoun ? 'VEINTIÚN' : 'VEINTIUNO';
    if (n === 22) return 'VEINTIDÓS';
    if (n === 23) return 'VEINTITRÉS';
    if (n === 26) return 'VEINTISÉIS';
    return `VEINTI${UNITS[n - 20].toLowerCase()}`.toUpperCase();
  }
  const remainder = n % 10;
  return remainder
    ? `${TENS[Math.floor(n / 10)]} Y ${lessThanThousand(remainder, beforeNoun)}`
    : TENS[Math.floor(n / 10)];
}

function integerToSpanish(n: number, beforeNoun = false): string {
  if (n === 0) return 'CERO';
  const parts: string[] = [];

  const millions = Math.floor(n / 1_000_000);
  if (millions) {
    const millionLabel = millions === 1 ? 'UN MILLÓN' :
      `${integerToSpanish(millions, true)} MILLONES`;
    parts.push(millionLabel);
  }

  const thousands = Math.floor((n % 1_000_000) / 1_000);
  if (thousands) {
    parts.push(thousands === 1 ? 'MIL' :
      `${lessThanThousand(thousands, true)} MIL`);
  }

  const remainder = n % 1_000;
  if (remainder) parts.push(lessThanThousand(remainder, beforeNoun));
  return parts.join(' ');
}

export function moneyToSpanishWordsMXN(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value >= 1_000_000_000) {
    throw new RangeError('Importe MXN no soportado para conversión a letra');
  }
  const totalCents = Math.round((value + Number.EPSILON) * 100);
  const pesos = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const words = integerToSpanish(pesos, true);
  return `${words} ${pesos === 1 ? 'PESO' : 'PESOS'} ${String(cents).padStart(2, '0')}/100 M.N.`;
}
