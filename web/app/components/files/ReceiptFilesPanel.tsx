'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import Button from '@/app/components/ui/Button';
import Section from '@/app/components/ui/layout/Section';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';
import {
  RECEIPT_FILE_MAX_COUNT,
  validateReceiptFileMetadata,
  formatReceiptFileSize,
} from '@/app/components/files/receipt-file-preview';

type ReceiptFile = {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: 'NOT_SCANNED' | 'PENDING_SCAN' | 'CLEAN' | 'INFECTED' | 'SCAN_FAILED';
  createdAt: string;
};

export default function ReceiptFilesPanel({
  receiptId,
}: {
  receiptId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ReceiptFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const resource = '/purchase-receipts/' + encodeURIComponent(receiptId) + '/files';

  const refresh = useCallback(async () => {
    const response = await api.get<ReceiptFile[]>(
      '/purchase-receipts/' + encodeURIComponent(receiptId) + '/files',
    );
    if (!Array.isArray(response.data)) {
      throw new Error('La lista de adjuntos no tiene el formato esperado');
    }
    setFiles(response.data);
  }, [receiptId]);

  useEffect(() => {
    let mounted = true;
    api.get<ReceiptFile[]>(
      '/purchase-receipts/' + encodeURIComponent(receiptId) + '/files',
    ).then((response) => {
      if (mounted) setFiles(response.data);
    }).catch((cause: unknown) => {
      if (mounted) setError(getApiErrorMessage(cause, 'No se pudieron consultar los adjuntos.'));
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [receiptId]);

  async function upload(selected: FileList | null) {
    if (!selected || selected.length === 0 || busy) return;
    const batch = Array.from(selected);
    if (files.length + batch.length > RECEIPT_FILE_MAX_COUNT) {
      setError('Máximo 5 archivos por recepción.');
      return;
    }
    for (const file of batch) {
      const validation = validateReceiptFileMetadata(file);
      if (!validation.ok) {
        setError(file.name + ': ' + validation.reason);
        return;
      }
      if (!file.type) {
        setError(file.name + ': el tipo MIME debe estar definido.');
        return;
      }
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      for (const file of batch) {
        const body = new FormData();
        body.append('file', file);
        await api.post(resource, body);
      }
      await refresh();
      setMessage('Adjunto(s) guardado(s) en R2. Sin análisis antivirus.');
    } catch (cause: unknown) {
      setError(getApiErrorMessage(cause, 'No fue posible guardar los adjuntos.'));
      try { await refresh(); } catch { /* Keep the last known list. */ }
    } finally {
      if (inputRef.current) inputRef.current.value = '';
      setBusy(false);
    }
  }

  async function download(file: ReceiptFile) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.get<Blob>(
        resource + '/' + encodeURIComponent(file.id) + '/download',
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.originalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause: unknown) {
      setError(getApiErrorMessage(cause, 'No fue posible descargar el archivo.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: ReceiptFile) {
    if (busy || !window.confirm('¿Retirar este archivo de la recepción?')) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(resource + '/' + encodeURIComponent(file.id));
      await refresh();
      setMessage('Archivo retirado de la recepción.');
    } catch (cause: unknown) {
      setError(getApiErrorMessage(cause, 'No fue posible retirar el archivo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <Section
        title="Documentos adjuntos · Zaping Files"
        description="PDF, JPG y JPEG. Archivos privados vinculados a esta recepción."
      >
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Integración en desarrollo: los archivos se almacenan sin análisis antivirus.
          Utiliza únicamente documentos de prueba confiables.
          El entorno productivo bloqueará descargas sin verificación.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            aria-label="Seleccionar documentos de la recepción"
            type="file"
            accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
            multiple
            disabled={busy || loading || files.length >= RECEIPT_FILE_MAX_COUNT}
            onChange={(event) => void upload(event.currentTarget.files)}
            className="max-w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-subtle file:px-3 file:py-2"
          />
          <span className="text-sm text-text-muted">
            {files.length}/{RECEIPT_FILE_MAX_COUNT} documentos · 10 MiB máximo por archivo
          </span>
        </div>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-text-secondary">{message}</p> : null}
        {loading ? <p role="status">Consultando adjuntos…</p> : null}
        {!loading && files.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-text-muted">
            Esta recepción no tiene documentos adjuntos.
          </p>
        ) : null}
        {files.length > 0 ? (
          <ul className="space-y-2" aria-label="Documentos almacenados">
            {files.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                <FileText size={20} className="shrink-0 text-blue-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium">{file.originalName}</p>
                  <p className="text-xs text-text-muted">
                    {formatReceiptFileSize(file.sizeBytes)} · {file.scanStatus === 'CLEAN' ? 'Analizado' : 'Sin análisis antivirus'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void download(file)}>
                    <Download size={16} aria-hidden="true" /> Descargar
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void remove(file)}>
                    <Trash2 size={16} aria-hidden="true" /> Retirar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <Paperclip size={16} aria-hidden="true" /> Se guarda después de registrar la recepción.
        </p>
      </Section>
    </div>
  );
}
