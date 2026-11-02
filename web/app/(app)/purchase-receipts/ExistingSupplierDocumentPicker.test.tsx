import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthenticatedSession, type UserRole } from '@/app/auth-session';
import { api } from '@/services/api';
import ReceiptSupplierDocuments from './ReceiptSupplierDocuments';

vi.mock('@/app/auth-session', () => ({ useAuthenticatedSession: vi.fn() }));
vi.mock('@/services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const company = '10000000-0000-4000-8000-000000000001';
const supplier = '20000000-0000-4000-8000-000000000001';
const receipt = '30000000-0000-4000-8000-000000000001';
const docA = '40000000-0000-4000-8000-000000000001';
const docB = '40000000-0000-4000-8000-000000000002';
const docC = '40000000-0000-4000-8000-000000000003';
const docD = '40000000-0000-4000-8000-000000000004';
const other = '90000000-0000-4000-8000-000000000001';
function document(id = docA, occurrence = 1) { return { id, companyId: company, supplierId: supplier, type: 'REMISION', series: 'A', number: '123', status: 'ACTIVE', identityOccurrence: occurrence }; }
function link(id = docA) { return { id: '50000000-0000-4000-8000-000000000001', receiptId: receipt, companyId: company, supplierId: supplier, documentId: id, removedAt: null, document: document(id) }; }
function role(value: UserRole = 'ADMIN', tenant = company) {
  vi.mocked(useAuthenticatedSession).mockReturnValue({ status: 'success', retry: vi.fn(), user: { id: 'actor', companyId: tenant, role: value, email: 'qa@example.invalid', firstName: 'QA', lastName: 'QA', companyTimezone: 'America/Hermosillo' } });
}
function view(receiptId = receipt, supplierId = supplier) { return <ReceiptSupplierDocuments receiptId={receiptId} supplierId={supplierId} legacyReference="REMISION · HISTORICAL-123" />; }
function deferred() { let resolve!: (value: { data: unknown }) => void; let reject!: (error: unknown) => void; const promise = new Promise<{data: unknown}>((yes,no)=>{resolve=yes;reject=no;}); return {resolve,reject,promise}; }
let documents: unknown;
let links: unknown;
beforeEach(() => {
  vi.resetAllMocks(); role(); documents = [document()]; links = [];
  vi.mocked(api.get).mockImplementation(async path => ({ data: path === '/supplier-documents' ? documents : links }) as never);
  vi.mocked(api.post).mockImplementation(async () => { links = [link()]; return { data: link() } as never; });
});
afterEach(cleanup);
async function open() { await userEvent.click(await screen.findByRole('button', {name:'Vincular documento existente'})); }
async function choose(id = docA) { await userEvent.selectOptions(await screen.findByRole('combobox', {name:'Documento del proveedor'}), id); }

it.each(['ADMIN','MANAGER'] as const)('loads only the purchase supplier, explicitly posts ID and rereads links for %s', async value => {
  role(value); render(view()); await open();
  expect(api.get).toHaveBeenCalledWith('/supplier-documents', {params:{supplierId:supplier}});
  expect(screen.getByText(/Se muestran hasta 50 documentos recientes. Si no aparece/)).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
  await choose(); await userEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));
  expect(api.post).toHaveBeenCalledExactlyOnceWith(`/supplier-documents/receipts/${receipt}/links`,{documentId:docA});
  expect((await screen.findByRole('link',{name:'Ver documento REMISION · A-123'})).getAttribute('href')).toBe(`/supplier-documents/${docA}`);
  expect(vi.mocked(api.get).mock.calls.filter(([path])=>path!== '/supplier-documents').length).toBe(3);
});

it('distinguishes identical folios by occurrence and ID, excludes cancelled and linked documents', async () => {
  documents=[document(),document(docB,2),{...document(docC),status:'CANCELLED'},document(docD)]; links=[link(docD)];
  render(view());await open();
  const select=await screen.findByRole('combobox',{name:'Documento del proveedor'});
  expect(select.textContent).toContain(`Ocurrencia #1 · ID: ${docA}`);
  expect(select.textContent).toContain(`Ocurrencia #2 · ID: ${docB}`);
  expect(select.textContent).not.toContain(docC);expect(select.textContent).not.toContain(docD);
  await choose(docB); vi.mocked(api.post).mockImplementationOnce(async()=>{links=[link(docB)];return {data:link(docB)} as never;});
  await userEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));
  await screen.findByRole('link',{name:'Ver documento REMISION · A-123'});
  expect(api.post).toHaveBeenCalledWith(`/supplier-documents/receipts/${receipt}/links`,{documentId:docB});
});

it('does not select automatically and protects against double submission', async () => {
  const pending=deferred(); vi.mocked(api.post).mockReturnValueOnce(pending.promise as never);
  render(view());await open();await screen.findByRole('combobox');
  expect((screen.getByRole('button',{name:'Confirmar vínculo'}) as HTMLButtonElement).disabled).toBe(true);
  expect(api.post).not.toHaveBeenCalled();await choose();
  await userEvent.dblClick(screen.getByRole('button',{name:'Confirmar vínculo'}));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button',{name:'Cancelar'}) as HTMLButtonElement).disabled).toBe(true);
  links=[link()];await act(async()=>{pending.resolve({data:link()});await pending.promise;});
  await screen.findByRole('link',{name:'Ver documento REMISION · A-123'});
});

it.each(['SALES','WAREHOUSE'] as const)('never lists or posts documents for %s', value => {
  role(value);render(view());expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Vincular documento existente'})).toBeNull();
});
it('does not offer linking before links resolve or after failure', async()=>{
  const pending=deferred();vi.mocked(api.get).mockReturnValueOnce(pending.promise as never);render(view());
  expect(screen.queryByRole('button',{name:'Vincular documento existente'})).toBeNull();
  await act(async()=>{pending.reject(new Error('offline'));await pending.promise.catch(()=>undefined);});
  await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Vincular documento existente'})).toBeNull();
});

it.each([
 null, {}, [null], [{...document(),id:123}], [{...document(),id:'folio-123'}],
 [{...document(),supplierId:other}], [{...document(),companyId:other}], [document(),document()],
 [{...document(),type:'UNKNOWN'}], [{...document(),status:'UNKNOWN'}], [{...document(),series:3}],
 [{...document(),number:null}], [{...document(),identityOccurrence:0}], [{...document(),identityOccurrence:1.5}],
 [{...document(),identityOccurrence:'1'}], Array.from({length:51},()=>document()),
].map(data=>({data})))('fails closed on malformed/cross-tenant/cross-supplier list %#',async({data})=>{
  documents=data;render(view());await open();await screen.findByRole('alert');expect(screen.queryByRole('combobox')).toBeNull();expect(api.post).not.toHaveBeenCalled();
});

it('rejects inconsistent refreshed links rather than offering options',async()=>{
  render(view());await screen.findByRole('button',{name:'Vincular documento existente'});links=[{...link(),companyId:other}];await open();await screen.findByRole('alert');expect(screen.queryByRole('combobox')).toBeNull();expect(api.post).not.toHaveBeenCalled();
});

it('keeps the 50-document warning with an empty eligible list',async()=>{
  documents=[{...document(),status:'CANCELLED'}];render(view());await open();await screen.findByText('No hay documentos elegibles en este listado reciente.');expect(screen.getByText(/hasta 50 documentos recientes/)).toBeTruthy();expect(screen.queryByRole('combobox')).toBeNull();expect(api.post).not.toHaveBeenCalled();
});

it.each([403,404,409,500])('requires refreshed data and new selection after HTTP %s',async status=>{
  vi.mocked(api.post).mockRejectedValueOnce({isAxiosError:true,response:{status,data:{message:'backend rejection'}}});
  render(view());await open();await choose();await userEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Actualiza el listado');
  expect(screen.queryByRole('combobox')).toBeNull();expect(screen.queryByRole('link')).toBeNull();
  documents=[document(docB,2)];await userEvent.click(screen.getByRole('button',{name:'Actualizar listado'}));
  const select=await screen.findByRole('combobox');expect((select as HTMLSelectElement).value).toBe('');expect(select.textContent).not.toContain(docA);
  await choose(docB);vi.mocked(api.post).mockImplementationOnce(async()=>{links=[link(docB)];return {data:link(docB)} as never;});await userEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));await screen.findByRole('link');
});

it('refreshes concurrent links before retry, excluding an association created elsewhere',async()=>{
  vi.mocked(api.post).mockRejectedValueOnce({isAxiosError:true,response:{status:409}});render(view());await open();await choose();await userEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));await screen.findByRole('alert');
  links=[link()];await userEvent.click(screen.getByRole('button',{name:'Actualizar listado'}));await screen.findByText('No hay documentos elegibles en este listado reciente.');expect(screen.getByRole('link')).toBeTruthy();expect(api.post).toHaveBeenCalledTimes(1);
});
it('does not invent a link from an inconsistent POST reply',async()=>{
  vi.mocked(api.post).mockResolvedValueOnce({data:{...link(),documentId:other}} as never);render(view());await open();await choose();await userEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));expect((await screen.findByRole('alert')).textContent).toContain('No se pudo verificar');expect(screen.queryByRole('link')).toBeNull();
});
it('supports list error retry and restores keyboard focus on cancel',async()=>{
  vi.mocked(api.get).mockImplementation(async path=>{if(path==='/supplier-documents')throw Error('offline');return {data:[]} as never;});render(view());await open();await screen.findByRole('alert');
  vi.mocked(api.get).mockImplementation(async path=>({data:path==='/supplier-documents'?[document()]:[]}) as never);
  await userEvent.click(screen.getByRole('button',{name:'Actualizar listado'}));await screen.findByRole('combobox');
  await userEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(documentActive()).toBe(screen.getByRole('button',{name:'Vincular documento existente'}));
});
function documentActive(){return globalThis.document.activeElement;}

it('discards a closed picker response on reopen',async()=>{
  const pending=deferred();let calls=0;vi.mocked(api.get).mockImplementation(async path=>path==='/supplier-documents'?(++calls===1?pending.promise:{data:[document(docB,2)]}):{data:[]});
  render(view());await open();await userEvent.click(screen.getByRole('button',{name:'Cancelar'}));await open();await screen.findByRole('combobox');
  await act(async()=>{pending.resolve({data:[document()]});await pending.promise;});expect(screen.getByRole('combobox').textContent).toContain(docB);expect(screen.getByRole('combobox').textContent).not.toContain(docA);
});

it.each(['receipt','supplier','company','actor','role'] as const)('invalidates loaded selection and pending POST on %s change',async change=>{
  const pending=deferred();vi.mocked(api.post).mockReturnValueOnce(pending.promise as never);const rendered=render(view());await open();await choose();await userEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));
  if(change==='company')role('ADMIN',other);if(change==='role')role('WAREHOUSE');if(change==='actor'){const s=vi.mocked(useAuthenticatedSession).mock.results.at(-1)!.value;vi.mocked(useAuthenticatedSession).mockReturnValue({...s,user:{...s.user,id:'other-actor'}});}
  rendered.rerender(view(change==='receipt'?other:receipt,change==='supplier'?other:supplier));
  expect(screen.queryByRole('combobox')).toBeNull();await act(async()=>{pending.resolve({data:link()});await pending.promise;});expect(screen.queryByRole('link')).toBeNull();expect(api.post).toHaveBeenCalledTimes(1);
});
it('discards a pending list across company changes',async()=>{
 const pending=deferred();vi.mocked(api.get).mockImplementation(async path=>path==='/supplier-documents'?pending.promise:{data:[]});const rendered=render(view());await open();role('ADMIN',other);rendered.rerender(view());await act(async()=>{pending.resolve({data:[document()]});await pending.promise;});expect(screen.queryByRole('combobox')).toBeNull();expect(api.post).not.toHaveBeenCalled();
});

it.each(['receipt','supplier','company','role'] as const)('discards pending list after %s changes',async change=>{
 const pending=deferred();vi.mocked(api.get).mockImplementation(async path=>path==='/supplier-documents'?pending.promise:{data:[]});const rendered=render(view());await open();
 if(change==='company')role('ADMIN',other);if(change==='role')role('WAREHOUSE');
 rendered.rerender(view(change==='receipt'?other:receipt,change==='supplier'?other:supplier));
 await act(async()=>{pending.resolve({data:[document()]});await pending.promise;});expect(screen.queryByRole('combobox')).toBeNull();expect(api.post).not.toHaveBeenCalled();
});
it('does not reuse a previous selection when supplier changes before POST',async()=>{
 const rendered=render(view());await open();await choose();rendered.rerender(view(receipt,other));
 expect(screen.queryByRole('combobox')).toBeNull();expect(api.post).not.toHaveBeenCalled();
});
