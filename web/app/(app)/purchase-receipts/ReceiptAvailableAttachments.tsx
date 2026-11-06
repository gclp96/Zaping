'use client';

import { useEffect, useState } from 'react';
import { api } from '@/services/api';

export type AvailableReceiptAttachment = {
  id: string;
  originalName: string;
  contentType: 'application/pdf' | 'image/jpeg';
  sizeBytes: number;
  createdAt: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validAvailableReceiptAttachments(
  value: unknown,
): value is AvailableReceiptAttachment[] {
  if (!Array.isArray(value) || value.length > 10) return false;
  const identifiers = new Set<string>();
  const allowed = ['id', 'originalName', 'contentType', 'sizeBytes', 'createdAt'];
  return value.every((item: unknown) => {
    if (!record(item) || Object.keys(item).some((key) => !allowed.includes(key))) {
      return false;
    }
    if (
      typeof item.id !== 'string' || item.id.trim().length === 0 ||
      identifiers.has(item.id) ||
      typeof item.originalName !== 'string' ||
      item.originalName.trim().length === 0 ||
      !['application/pdf', 'image/jpeg'].includes(String(item.contentType)) ||
      !Number.isSafeInteger(item.sizeBytes) ||
      (item.sizeBytes as number) < 1 ||
      (item.sizeBytes as number) > 10 * 1024 * 1024 ||
      typeof item.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(item.createdAt))
    ) return false;
    identifiers.add(item.id);
    return true;
  });
}

/**
 * QA-only, metadata-only view. No download action or file bytes.
 * Parent checks management role and validates the linked document ID.
 * Server remains the authority for JWT, role and tenant authorization.
 */
export default function ReceiptAvailableAttachments({
  documentId,
  enabled,
}: {
  documentId: string;
  enabled: boolean;
}) {
  const [items, setItems] = useState<AvailableReceiptAttachment[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    api.get<unknown>(
      `/supplier-documents/${encodeURIComponent(documentId)}/attachments`,
    ).then(({ data }) => {
      if (!current) return;
      if (!validAvailableReceiptAttachments(data)) {
        setError('Respuesta de adjuntos inválida.');
        return;
      }
      setItems(data);
      setError('');
    }).catch(() => {
      if (current) setError('No fue posible consultar adjuntos.');
    });
    return () => { current = false; };
  }, [documentId, enabled]);

  if (!enabled) return null;
  return (
    <div className="w-full border-t border-border pt-2 text-xs text-text-muted">
      <p className="mb-1 font-semibold">Adjuntos aprobados (consulta QA)</p>
      {error ? <p role="alert">{error}</p> : null}
      {!error && items === null ? (
        <p role="status">Consultando adjuntos...</p>
      ) : null}
      {!error && items?.length === 0 ? (
        <p>No hay adjuntos aprobados.</p>
      ) : null}
      {!error && items && items.length > 0 ? (
        <ul className="space-y-1" aria-label="Adjuntos aprobados">
          {items.map((item) => (
            <li key={item.id} className="break-all">
              {item.originalName}
              {' · '}
              {Math.ceil(item.sizeBytes / 1024)} KB
              {' · '}
              Sólo consulta
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
