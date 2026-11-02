'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useAuthenticatedSession } from '@/app/auth-session';
import { hasRole, MANAGEMENT_ROLES } from '@/app/erp-role-access';
import Button from '@/app/components/ui/Button';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';

import { validLinks, type LinkedSupplierDocument } from './receipt-document-contract';
import ExistingSupplierDocumentPicker from './ExistingSupplierDocumentPicker';

function documentLabel(document: LinkedSupplierDocument['document']) {
  const number = [document.series, document.number].filter(Boolean).join('-');
  return `${document.type.replaceAll('_', ' ')} · ${number}`;
}

export default function ReceiptSupplierDocuments({
  receiptId,
  legacyReference,
  supplierId,
}: {
  receiptId: string;
  supplierId: string;
  legacyReference: string | null;
}) {
  const session = useAuthenticatedSession();
  const role = session.status === 'success' ? session.user.role : null;
  const canView = hasRole(role, MANAGEMENT_ROLES);
  // Reset synchronously on receipt, actor, tenant and permission changes.
  const identity = session.status === 'success'
    ? JSON.stringify([receiptId, supplierId, session.user.companyId, session.user.id, role])
    : session.status;
  return <DocumentLinks key={identity} receiptId={receiptId}
    supplierId={supplierId} legacyReference={legacyReference} session={session} canView={canView} />;
}

function DocumentLinks({ receiptId, supplierId, legacyReference, session, canView }: {
  receiptId: string;
  supplierId: string;
  legacyReference: string | null;
  session: ReturnType<typeof useAuthenticatedSession>;
  canView: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current && trigger.current && !pickerOpen) {
      trigger.current.focus();
      restoreFocus.current = false;
    }
  });
  const closePicker = () => { restoreFocus.current = true; setPickerOpen(false); };
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

      {canView && session.status === 'success' && !error && links !== null && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <button ref={trigger} type="button" disabled={pickerOpen}
            className="rounded-lg border border-border px-3 py-2 font-medium text-blue-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4"
            onClick={() => setPickerOpen(true)}>
            Vincular documento existente
          </button>
          {pickerOpen && <ExistingSupplierDocumentPicker
            receiptId={receiptId} supplierId={supplierId} companyId={session.user.companyId}
            onClose={closePicker}
            onLinksLoaded={setLinks}
            onLinked={() => { closePicker(); setLinks(null); setReload(value => value + 1); }}
          />}
        </div>
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
