'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/app/components/ui/Button';
import Select from '@/app/components/ui/Select';
import { api } from '@/services/api';
import { getApiErrorMessage, getApiErrorStatus } from '@/services/errors';
import { validLinks, type LinkedSupplierDocument } from './receipt-document-contract';

type Document = LinkedSupplierDocument['document'] & { supplierId: string; companyId: string; identityOccurrence: number };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function sameScope(value: unknown, supplierId: string, companyId: string) {
  return record(value) && value.supplierId === supplierId && value.companyId === companyId;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function validDocuments(value: unknown, supplierId: string, companyId: string): value is Document[] {
  if (!Array.isArray(value) || value.length > 50) return false;
  const ids = new Set<string>();
  return value.every((doc: unknown) => {
    if (!record(doc) || !uuid(doc.id) || ids.has(doc.id) || doc.supplierId !== supplierId || doc.companyId !== companyId ||
      typeof doc.number !== 'string' || !doc.number.trim() || !(doc.series === null || typeof doc.series === 'string') ||
      typeof doc.type !== 'string' || !['FACTURA','REMISION','NOTA_ENTREGA'].includes(doc.type) ||
      typeof doc.status !== 'string' || !['ACTIVE','CANCELLED'].includes(doc.status) || !Number.isSafeInteger(doc.identityOccurrence) || Number(doc.identityOccurrence) < 1) return false;
    ids.add(doc.id);
    return true;
  });
}

export default function ExistingSupplierDocumentPicker({ receiptId, supplierId, companyId, onClose, onLinksLoaded, onLinked }: {
  receiptId: string; supplierId: string; companyId: string;
  onClose: () => void; onLinksLoaded: (links: LinkedSupplierDocument[]) => void; onLinked: () => void;
}) {
  const [options, setOptions] = useState<Document[] | null>(null);
  const [selection, setSelection] = useState('');
  const [error, setError] = useState(() => uuid(receiptId) && uuid(supplierId) && uuid(companyId) ? '' : 'La identidad de la recepción o proveedor no es válida.');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(false);
  const submitting = useRef(false);
  // Parent keys the entire document UI by receipt, supplier, company, actor and role.
  // Closing unmounts this picker, so a new opening never shares pending results.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    if (!uuid(receiptId) || !uuid(supplierId) || !uuid(companyId)) return;
    Promise.all([
      api.get<unknown>('/supplier-documents', { params: { supplierId } }),
      api.get<unknown>(`/supplier-documents/receipts/${encodeURIComponent(receiptId)}/links`),
    ]).then(([documents, links]) => {
      if (!current) return;
      if (!validDocuments(documents.data, supplierId, companyId) || !validLinks(links.data, receiptId) || links.data.some(link => !sameScope(link, supplierId, companyId))) {
        setError('La respuesta documental no es válida. Actualiza el listado para reintentar.');
        return;
      }
      const linked = new Set(links.data.map(link => link.documentId));
      setOptions(documents.data.filter(doc => doc.status === 'ACTIVE' && !linked.has(doc.id)));
      onLinksLoaded(links.data);
    }).catch((failure: unknown) => {
      if (current) setError(getApiErrorMessage(failure, 'No fue posible cargar los documentos del proveedor.'));
    });
    return () => { current = false; };
  }, [receiptId, supplierId, companyId, attempt, onLinksLoaded]);

  async function attach() {
    if (!alive.current || submitting.current || !options || !options.some(doc => doc.id === selection)) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post<unknown>(`/supplier-documents/receipts/${encodeURIComponent(receiptId)}/links`, { documentId: selection });
      if (!alive.current) return;
      if (!record(data) || !uuid(data.id) || data.receiptId !== receiptId || data.documentId !== selection ||
        data.companyId !== companyId || data.supplierId !== supplierId || data.removedAt !== null) {
        setOptions(null); setSelection('');
        setError('No se pudo verificar la confirmación. Actualiza el listado para consultar el estado real antes de reintentar.');
        return;
      }
      onLinked();
    } catch (failure: unknown) {
      if (!alive.current) return;
      setOptions(null); setSelection('');
      const status = getApiErrorStatus(failure);
      const message = status === 403 ? 'No tienes permiso para vincular documentos.'
        : status === 404 ? 'La recepción o el documento ya no están disponibles.'
        : status === 409 ? 'El documento cambió o ya no se puede vincular.'
        : getApiErrorMessage(failure, 'No fue posible vincular el documento.');
      setError(`${message} Actualiza el listado antes de reintentar.`);
    } finally {
      submitting.current = false;
      if (alive.current) setSaving(false);
    }
  }

  return <section aria-label="Vincular documento del proveedor" className="min-w-0 space-y-3">
    <p className="text-text-muted">Se muestran hasta 50 documentos recientes. Si no aparece, puede estar fuera de este listado</p>
    <p className="text-text-secondary">Selecciona explícitamente un documento activo del proveedor de esta compra.</p>
    {error ? <div role="alert" className="space-y-2">
      <p>{error}</p>
      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => {
        setOptions(null); setSelection(''); setError(''); setAttempt(value => value + 1);
      }}>Actualizar listado</Button>
    </div> : options === null ? <p role="status">Cargando documentos del proveedor...</p> : <>
      {options.length === 0 ? <p>No hay documentos elegibles en este listado reciente.</p> : <Select autoFocus
        label="Documento del proveedor" value={selection} disabled={saving}
        placeholder="Selecciona el documento exacto" onChange={event => setSelection(event.target.value)}
        options={options.map(doc => ({ value: doc.id, label: `${doc.type.replaceAll('_',' ')} · ${[doc.series,doc.number].filter(Boolean).join('-')} · Ocurrencia #${doc.identityOccurrence} · ID: ${doc.id}` }))} />}
      <Button type="button" size="sm" disabled={saving || !selection || !options.some(doc => doc.id === selection)} onClick={() => void attach()}>
        {saving ? 'Vinculando...' : 'Confirmar vínculo'}
      </Button>
    </>}
    {saving && <p role="status">Guardando vínculo documental...</p>}
    <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onClose}>Cancelar</Button>
  </section>;
}
