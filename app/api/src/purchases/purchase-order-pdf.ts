import PDFDocument from 'pdfkit';
import { Response } from 'express';

import {
  buildPurchaseCommercialSnapshot,
  formatPurchaseCalendarDate,
  formatPurchaseIssueDate,
  PurchaseCommercialSource,
  readPurchaseCommercialSnapshot,
} from './purchase-commercial';
import { moneyToSpanishWordsMXN } from './purchase-money-words';

type PurchasePdfSource = PurchaseCommercialSource & {
  folio: string;
  status: string;
  subtotal: number;
  iva: number;
  total: number;
  commercialSnapshot?: unknown;
};

const TEXT = '#172033';
const MUTED = '#52637A';
const BLUE = '#155EEF';
const RULE = '#D5DCE6';
const LIGHT = '#F3F6FB';

function clean(value?: string | null): string | null {
  return value?.trim() || null;
}

function money(value: number, currency: string, decimals: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function renderPurchaseOrderPdf(
  purchase: PurchasePdfSource,
  res: Response,
): void {
  const frozen = readPurchaseCommercialSnapshot(purchase.commercialSnapshot);
  // Older documents have no snapshot; they remain readable without inventing
  // historical fiscal data that was never captured.
  const snapshot = frozen ?? buildPurchaseCommercialSnapshot(purchase);
  const issuer = snapshot.issuer;
  const supplier = snapshot.supplier;
  const terms = snapshot.terms;
  const currency = issuer.currency || 'MXN';
  const issued = formatPurchaseIssueDate(
    purchase.createdAt,
    issuer.timezone || 'America/Hermosillo',
  );

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 46, bottom: 48, left: 45, right: 45 },
    bufferPages: true,
  });

  const safeFolio = purchase.folio.replace(/[^a-zA-Z0-9-_]/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="orden-compra-${safeFolio}.pdf"`,
  );
  doc.pipe(res);

  const left = 45;
  const right = 567;
  const width = right - left;
  const usableBottom = 718;
  let y = 48;

  function textAt(
    value: string,
    x: number,
    top: number,
    w: number,
    size = 9,
    bold = false,
    color = TEXT,
    align: 'left' | 'right' | 'center' = 'left',
  ): number {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor(color)
      .text(value, x, top, {
        width: w,
        align,
        lineGap: 1.5,
      });
    return doc.y;
  }

  function line(at: number) {
    doc
      .moveTo(left, at)
      .lineTo(right, at)
      .strokeColor(RULE)
      .lineWidth(0.7)
      .stroke();
  }

  function ensureRoom(space: number, withTableHeader = false) {
    if (y + space <= usableBottom) return;
    doc.addPage();
    y = 53;
    textAt('ORDEN DE COMPRA', left, y, 210, 10, true, BLUE);
    textAt(purchase.folio, right - 170, y, 170, 10, true, MUTED, 'right');
    y += 28;
    line(y);
    y += 11;
    if (withTableHeader) drawTableHeader();
  }

  // The company legal name is the document's primary identity.
  // Zaping branding remains only in the footer.
  const headerY = y;
  textAt(issuer.legalName, left, headerY, 300, 16, true, TEXT);
  const companyLines = [
    issuer.rfc && `RFC: ${issuer.rfc}`,
    clean(issuer.fiscalAddress),
  ].filter((value): value is string => Boolean(value));
  let companyY = doc.y + 5;
  for (const value of companyLines) {
    companyY = textAt(value, left, companyY, 300, 8.5, false, MUTED) + 3;
  }

  const rightHeaderX = right - 214;
  textAt(
    'ORDEN DE COMPRA',
    right - 236,
    headerY - 2,
    236,
    18,
    true,
    TEXT,
    'right',
  );
  let folioY =
    textAt(
      purchase.folio,
      rightHeaderX,
      headerY + 31,
      214,
      12,
      true,
      BLUE,
      'right',
    ) + 4;
  folioY =
    textAt(
      `Fecha: ${issued}`,
      rightHeaderX,
      folioY,
      214,
      9,
      false,
      MUTED,
      'right',
    ) + 3;
  folioY = textAt(
    `Lugar de expedición: ${clean(issuer.placeOfIssue) || 'No aplica'}`,
    rightHeaderX,
    folioY,
    214,
    8.5,
    false,
    MUTED,
    'right',
  );
  y = Math.max(companyY, folioY) + 16;
  line(y);
  y += 15;

  // Datos del proveedor y condiciones del documento.
  textAt('PROVEEDOR', left, y, 235, 9, true, BLUE);
  textAt('CONDICIONES COMERCIALES', left + 263, y, 250, 9, true, BLUE);
  y += 18;
  let supplierY =
    textAt(supplier.legalName || supplier.name, left, y, 239, 10, true) + 3;
  const supplierLines = [
    supplier.legalName && supplier.name !== supplier.legalName
      ? `Nombre comercial: ${supplier.name}`
      : null,
    supplier.rfc ? `RFC: ${supplier.rfc}` : null,
    clean(supplier.fiscalAddress),
    supplier.code ? `Código proveedor: ${supplier.code}` : null,
  ].filter((value): value is string => Boolean(value));
  for (const value of supplierLines) {
    supplierY = textAt(value, left, supplierY, 239, 8.5, false, MUTED) + 2;
  }

  const termLines = [
    `Condiciones de pago: ${clean(terms.paymentTerms) || 'No aplica'}`,
    `Método de pago: ${clean(terms.paymentMethod) || 'No aplica'}`,
    `Fecha de pago: ${formatPurchaseCalendarDate(terms.paymentDueDate) || 'No aplica'}`,
    `Entrega comprometida: ${formatPurchaseCalendarDate(terms.expectedDeliveryDate) || 'No aplica'}`,
    `Comprador: ${clean(terms.buyerName) || 'No aplica'}`,
  ];
  let termsY = y;
  for (const value of termLines) {
    termsY = textAt(value, left + 263, termsY, 253, 8.5, false, MUTED) + 4;
  }
  y = Math.max(supplierY, termsY, y + 28) + 14;
  ensureRoom(80);
  line(y);
  y += 16;
  textAt('DETALLE DE PRODUCTOS', left, y, 270, 10, true, TEXT);
  y += 22;

  const x = {
    sku: left + 8,
    product: left + 81,
    quantity: left + 271,
    cost: left + 337,
    discount: left + 413,
    amount: left + 468,
  };
  const w = {
    sku: 71,
    product: 185,
    quantity: 64,
    cost: 75,
    discount: 50,
    amount: 54,
  };

  function drawTableHeader() {
    doc.rect(left, y, width, 28).fill(LIGHT);
    textAt('SKU', x.sku, y + 8, w.sku, 8.5, true);
    textAt('Producto / descripción', x.product, y + 8, w.product, 8.5, true);
    textAt(
      'Cant./unid.',
      x.quantity,
      y + 8,
      w.quantity,
      7.5,
      true,
      TEXT,
      'right',
    );
    textAt('Costo unit.', x.cost, y + 8, w.cost, 8, true, TEXT, 'right');
    textAt('Desc.', x.discount, y + 8, w.discount, 8, true, TEXT, 'right');
    textAt('Importe', x.amount, y + 8, w.amount, 8, true, TEXT, 'right');
    y += 30;
  }

  drawTableHeader();
  for (const item of snapshot.items) {
    doc.font('Helvetica').fontSize(8.5);
    const nameHeight = doc.heightOfString(item.name, {
      width: w.product,
      lineGap: 1.5,
    });
    const skuHeight = doc.heightOfString(item.sku, {
      width: w.sku,
      lineGap: 1.5,
    });
    const quantityLabel = item.unitOfMeasure?.trim()
      ? `${item.quantity} ${item.unitOfMeasure.trim()}`
      : String(item.quantity);
    const quantityHeight = doc.heightOfString(quantityLabel, {
      width: w.quantity,
      lineGap: 1.5,
    });
    const rowHeight = Math.max(
      33,
      nameHeight + 15,
      skuHeight + 15,
      quantityHeight + 15,
    );
    ensureRoom(rowHeight + 9, true);

    const rowY = y + 7;
    textAt(item.sku, x.sku, rowY, w.sku, 8, false, MUTED);
    textAt(item.name, x.product, rowY, w.product, 8.5);
    textAt(
      quantityLabel,
      x.quantity,
      rowY,
      w.quantity,
      8.5,
      false,
      TEXT,
      'right',
    );
    textAt(
      money(item.listUnitCost ?? item.unitCost, currency, 4),
      x.cost,
      rowY,
      w.cost,
      8.5,
      false,
      TEXT,
      'right',
    );
    const discount = item.discountPercent ?? 0;
    textAt(
      discount > 0 ? `${discount.toFixed(2)}%` : '—',
      x.discount,
      rowY,
      w.discount,
      8,
      false,
      MUTED,
      'right',
    );
    textAt(
      money(item.subtotal, currency, 2),
      x.amount,
      rowY,
      w.amount,
      8.5,
      false,
      TEXT,
      'right',
    );
    y += rowHeight;
    line(y);
    y += 3;
  }

  ensureRoom(140);
  y += 15;
  const totalsX = right - 243;
  const labelsWidth = 105;
  const amountWidth = 128;

  textAt('Subtotal', totalsX, y, labelsWidth, 9, false, MUTED);
  textAt(
    money(purchase.subtotal, currency, 2),
    totalsX + labelsWidth,
    y,
    amountWidth,
    9,
    false,
    TEXT,
    'right',
  );
  y += 22;
  textAt('IVA (16%)', totalsX, y, labelsWidth, 9, false, MUTED);
  textAt(
    money(purchase.iva, currency, 2),
    totalsX + labelsWidth,
    y,
    amountWidth,
    9,
    false,
    TEXT,
    'right',
  );
  y += 22;
  doc.moveTo(totalsX, y).lineTo(right, y).strokeColor(RULE).stroke();
  y += 10;
  textAt('TOTAL', totalsX, y, labelsWidth, 11, true);
  textAt(
    money(purchase.total, currency, 2),
    totalsX + labelsWidth,
    y,
    amountWidth,
    12,
    true,
    BLUE,
    'right',
  );
  y += 30;

  if (
    currency === 'MXN' &&
    purchase.total >= 0 &&
    purchase.total < 1_000_000_000
  ) {
    const words = moneyToSpanishWordsMXN(purchase.total);
    textAt('TOTAL CON LETRA', left, y, 245, 8, true, MUTED);
    y += 14;
    const bottom = textAt(words, left, y, width, 9, true);
    y = bottom + 8;
  }

  const pageRange = doc.bufferedPageRange();
  for (let index = 0; index < pageRange.count; index += 1) {
    doc.switchToPage(pageRange.start + index);
    doc.moveTo(left, 726).lineTo(right, 726).strokeColor(RULE).stroke();
    textAt(
      'Documento generado por Zaping ERP',
      left,
      733,
      315,
      7.5,
      false,
      MUTED,
    );
    textAt(
      `Página ${index + 1} de ${pageRange.count}`,
      right - 145,
      733,
      145,
      7.5,
      false,
      MUTED,
      'right',
    );
  }
  doc.end();
}
