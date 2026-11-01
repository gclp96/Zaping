'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuthenticatedSession } from '@/app/auth-session';
import { hasRole, MANAGEMENT_ROLES } from '@/app/erp-role-access';
import Button from '@/app/components/ui/Button';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';

type LinkedSupplierDocument = {
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

function validLinks(value: unknown, receiptId: string): value is LinkedSupplierDocument[] {
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

function documentLabel(document: LinkedSupplierDocument['document']) {
  const number = [document.series, document.number].filter(Boolean).join('-');
  return `${document.type.replaceAll('_', ' ')} · ${number}`;
}

export default function ReceiptSupplierDocuments({
  receiptId,
  legacyReference,
}: {
  receiptId: string;
  legacyReference: string | null;
}) {
  const session = useAuthenticatedSession();
  const role = session.status === 'success' ? session.user.role : null;
  const canView = hasRole(role, MANAGEMENT_ROLES);
  // Reset synchronously on receipt, actor, tenant and permission changes.
  const identity = session.status === 'success'
    ? JSON.stringify([receiptId, session.user.companyId, session.user.id, role])
    : session.status;
  return <DocumentLinks key={identity} receiptId={receiptId}
    legacyReference={legacyReference} session={session} canView={canView} />;
}

function DocumentLinks({ receiptId, legacyReference, session, canView }: {
  receiptId: string;
  legacyReference: string | null;
  session: ReturnType<typeof useAuthenticatedSession>;
  canView: boolean;
}) {
  const [links, setLinks] = useState<LinkedSupplierDocument[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!canView) return;
    let current = true;

    api
      .get<unknown>(
        `/supplier-documents/receipts/${encodeURIComponent(receiptId)}/links`,
      )
      .then(({ data }) => {
        if (!current) return;
        if (!validLinks(data, receiptId)) {
          setError('La respuesta de vínculos documentales no es válida.');
          return;
        }
        setLinks(data);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (!current) return;
        setError(
          getApiErrorMessage(
            requestError,
            'No fue posible consultar los documentos vinculados.',
          ),
        );
      });

    return () => {
      current = false;
    };
  }, [canView, receiptId, reload]);

  return (
    <div className="space-y-2 text-sm font-normal">
      {legacyReference && (
        <p className="text-text-secondary">
          Referencia registrada: {legacyReference}
        </p>
      )}

      {session.status === 'loading' && (
        <p className="text-text-muted">Verificando permisos documentales...</p>
      )}

      {session.status === 'success' && !canView && (
        <p className="text-text-muted">
          Solo Administración o Gerencia puede consultar los documentos vinculados.
        </p>
      )}

      {(session.status === 'error' || session.status === 'unauthenticated') && (
        <p className="text-text-muted">
          No fue posible verificar permisos para los documentos.
        </p>
      )}

      {canView && error && (
        <div role="alert" className="space-y-2">
          <p className="text-red-700">{error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setError('');
              setLinks(null);
              setReload((value) => value + 1);
            }}
          >
            Reintentar documentos
          </Button>
        </div>
      )}

      {canView && !error && links === null && (
        <p role="status" className="text-text-muted">Cargando documentos vinculados...</p>
      )}

      {canView && !error && links?.length === 0 && (
        <p className="text-text-muted">
          {legacyReference
            ? 'Referencia documental sin vínculo por ID. No se puede abrir por folio.'
            : 'Sin documento vinculado por ID.'}
        </p>
      )}

      {canView && !error && links && links.length > 0 && (
        <ul className="space-y-2" aria-label="Documentos vinculados a esta recepción">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center gap-2">
              <span className="text-text-secondary">
                {documentLabel(link.document)}
                {link.document.status === 'CANCELLED' && ' (registro cancelado)'}
                <span className="block break-all text-xs text-text-muted">ID: {link.document.id}</span>
              </span>
              <Link
                href={`/supplier-documents/${encodeURIComponent(link.document.id)}`}
                aria-label={`Ver documento ${documentLabel(link.document)}`}
                className="font-semibold text-blue-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
              >
                Ver documento
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
