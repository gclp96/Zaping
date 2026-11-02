export type LinkedSupplierDocument = {
  id: string;
  receiptId: string;
  documentId: string;
  document: {
    id: string;
    type: 'FACTURA' | 'REMISION' | 'NOTA_ENTREGA';
    series: string | null;
    number: string;
    status: 'ACTIVE' | 'CANCELLED';
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validLinks(value: unknown, receiptId: string): value is LinkedSupplierDocument[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  const documents = new Set<string>();
  return value.every((link: unknown) => {
    if (!isRecord(link) || !isRecord(link.document)) return false;
    const doc = link.document;
    if (!nonempty(link.id) || !nonempty(doc.id) ||
      link.receiptId !== receiptId || link.documentId !== doc.id ||
      !nonempty(doc.number) || !(doc.series === null || typeof doc.series === 'string') ||
      typeof doc.type !== 'string' || !['FACTURA', 'REMISION', 'NOTA_ENTREGA'].includes(doc.type) ||
      typeof doc.status !== 'string' || !['ACTIVE', 'CANCELLED'].includes(doc.status) ||
      (link.removedAt !== undefined && link.removedAt !== null) ||
      ids.has(link.id) || documents.has(doc.id)) return false;
    ids.add(link.id);
    documents.add(doc.id);
    return true;
  });
}
