import { PassThrough } from 'node:stream';
import PDFDocument from 'pdfkit';
import { Response } from 'express';

import { renderPurchaseOrderPdf } from './purchase-order-pdf';

describe('purchase order PDF', () => {
  const base = {
    folio: 'OC-26-00003',
    status: 'CONFIRMED',
    createdAt: new Date('2026-11-18T00:43:35.000Z'),
    company: {
      name: 'Empresa de prueba',
      tradeName: 'Empresa QA',
      rfc: 'EMI010101AAA',
      fiscalAddress: 'Calle 100, Hermosillo',
      placeOfIssue: 'Hermosillo, Sonora',
      timezone: 'America/Hermosillo',
      currency: 'MXN',
    },
    supplier: {
      name: 'Proveedor QA',
      legalName: 'Proveedor Legal S.A. de C.V.',
      rfc: 'PRL010101AAA',
      fiscalAddress: 'Calle 200, Monterrey',
      supplierCode: '177',
    },
    paymentTerms: 'Crédito 30 días',
    paymentMethod: 'Transferencia electrónica',
    paymentDueDate: new Date('2026-12-17T00:00:00.000Z'),
    expectedDeliveryDate: new Date('2026-11-17T00:00:00.000Z'),
    buyerName: 'Comprador QA',
    subtotal: 100,
    iva: 16,
    total: 116,
    items: [
      {
        productId: 'product-1',
        product: { sku: 'INS-1', name: 'Equipo de prueba' },
        quantity: 10,
        price: 10,
        subtotal: 100,
      },
    ],
  };

  it('returns a valid PDF stream with download headers', async () => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    const headers: Record<string, string> = {};
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    const result = new Promise<Buffer>((resolve, reject) => {
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
    const response = Object.assign(stream, {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    }) as unknown as Response;

    renderPurchaseOrderPdf(base, response);
    const pdf = await result;
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1500);
    const pageMarkers = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g);
    expect(pageMarkers).toHaveLength(1);
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toContain('OC-26-00003');
  });

  it('renders issuer legal identity, issue place and explicit commercial placeholders', async () => {
    const written = jest.spyOn(PDFDocument.prototype, 'text');
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const response = Object.assign(stream, {
      setHeader: jest.fn(),
    }) as unknown as Response;

    try {
      renderPurchaseOrderPdf(
        {
          ...base,
          status: 'DRAFT',
          company: {
            ...base.company,
            name: 'RAZÓN SOCIAL DE LA EMPRESA EMISORA S.A. DE C.V.',
          },
          paymentTerms: null,
          paymentMethod: null,
          paymentDueDate: null,
          expectedDeliveryDate: null,
          buyerName: null,
        },
        response,
      );
      await completed;
      const displayed = written.mock.calls.map(([value]) => String(value));

      expect(displayed).toContain(
        'RAZÓN SOCIAL DE LA EMPRESA EMISORA S.A. DE C.V.',
      );
      expect(displayed).toContain('Lugar de expedición: Hermosillo, Sonora');
      expect(displayed).toContain('Condiciones de pago: No aplica');
      expect(displayed).toContain('Método de pago: No aplica');
      expect(displayed).toContain('Fecha de pago: No aplica');
      expect(displayed).toContain('Entrega comprometida: No aplica');
      expect(displayed).toContain('Comprador: No aplica');
      expect(displayed).toContain('Documento generado por Zaping ERP');
      expect(displayed).not.toContain('ZAPING');
      expect(displayed.some((value) => value.startsWith('Estado:'))).toBe(
        false,
      );

      const issuePlaceIndex = displayed.indexOf(
        'Lugar de expedición: Hermosillo, Sonora',
      );
      const termsTitleIndex = displayed.indexOf('CONDICIONES COMERCIALES');
      expect(issuePlaceIndex).toBeGreaterThanOrEqual(0);
      expect(issuePlaceIndex).toBeLessThan(termsTitleIndex);
    } finally {
      written.mockRestore();
    }
  });

  it('prints multiple pages with long purchase lines', async () => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    const result = new Promise<Buffer>((resolve, reject) => {
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
    const response = Object.assign(stream, {
      setHeader: jest.fn(),
    }) as unknown as Response;

    renderPurchaseOrderPdf(
      {
        ...base,
        items: Array.from({ length: 60 }, (_, i) => ({
          ...base.items[0],
          productId: `product-${i}`,
          product: {
            sku: `SKU-${i}`,
            name: `Producto ${i}: artículo con descripción comercial suficientemente larga`,
          },
        })),
      },
      response,
    );
    const pdf = await result;
    const raw = pdf.toString('latin1');
    expect((raw.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
