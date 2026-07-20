import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { SectionHead, Empty, Modal, StatusPill } from '@/components/ui-market';
import { fmtDate, daysUntil } from '@/lib/format';
import { Plus, Pencil, Trash2, Upload, FileText, AlertTriangle } from 'lucide-react';

const TYPES = ['permit', 'license', 'insurance', 'tax'];
const empty = { type: 'permit', name: '', market_id: '', issue_date: '', expiration_date: '', notes: '' };

async function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

export default function Compliance() {
  const [items, setItems] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [it, mk, sw] = await Promise.all([
        api.get('/compliance'),
        api.get('/markets'),
        api.post('/compliance/sweep'),
      ]);
      setItems(it.data);
      setMarkets(mk.data);
      setReminders(sw.data.log || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const marketName = (mid) => markets.find(m => m.id === mid)?.name || 'Vendor-wide';

  const vendorWide = items.filter(i => !i.market_id);
  const perMarket = useMemo(() => {
    const g = {};
    for (const i of items) {
      if (!i.market_id) continue;
      (g[i.market_id] = g[i.market_id] || []).push(i);
    }
    return g;
  }, [items]);

  const openCreate = () => setModal({ form: { ...empty } });
  const openEdit = (c) => setModal({ id: c.id, form: { ...c, market_id: c.market_id || '' } });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...modal.form,
        market_id: modal.form.market_id || null,
      };
      if (modal.file) {
        payload.document_base64 = await fileToDataUrl(modal.file);
        payload.document_filename = modal.file.name;
      }
      if (modal.id) await api.patch(`/compliance/${modal.id}`, payload);
      else await api.post('/compliance', payload);
      setModal(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const del = async (c) => {
    if (!confirm(`Remove "${c.name}"?`)) return;
    await api.delete(`/compliance/${c.id}`);
    load();
  };

  const anyActionNeeded = items.some(i => i.status !== 'active');

  return (
    <div>
      <SectionHead title="Compliance">
        <button className="btn primary tiny" onClick={openCreate} data-testid="add-compliance-btn"><Plus size={12} /> Add item</button>
      </SectionHead>
      <p style={{ color: 'var(--charcoal-soft)', marginBottom: 20, fontSize: 14 }}>
        Track permits, licenses, insurance certs and tax registrations. We'll flag anything expiring within 30 days.
      </p>

      {anyActionNeeded && (
        <div className="banner warn" style={{ marginBottom: 20 }} data-testid="compliance-alert-banner">
          <AlertTriangle size={16} />
          <span>Some items need attention. Renew before their expiration to keep your markets clear.</span>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="canvas-surface" style={{ padding: '12px 18px', marginBottom: 22 }} data-testid="reminders-list">
          <div className="display-xs" style={{ marginBottom: 6 }}>Recent reminders</div>
          <div style={{ fontSize: 13, color: 'var(--charcoal-soft)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {reminders.slice(0, 5).map(r => (
              <span key={r.id} className="status-pill expiring">{r.compliance_name} — {r.days_before}d</span>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="empty">Loading…</div>}

      {!loading && items.length === 0 && <Empty title="No compliance items yet">Add a permit or insurance certificate to start tracking.</Empty>}

      {!loading && items.length > 0 && (
        <>
          {/* Vendor-wide */}
          <div className="display" style={{ marginBottom: 10 }}>Vendor-wide</div>
          {vendorWide.length === 0 ? (
            <Empty title="No vendor-wide items">Add items that apply to your whole business (state permits, insurance).</Empty>
          ) : (
            <div className="canvas-surface" style={{ padding: '4px 20px 4px 20px', marginBottom: 24 }}>
              <ComplianceList items={vendorWide} onEdit={openEdit} onDelete={del} />
            </div>
          )}

          {/* Per market */}
          <div className="display" style={{ marginBottom: 10, marginTop: 8 }}>Per market</div>
          {Object.keys(perMarket).length === 0 ? (
            <Empty title="No per-market items">Attach permits or booth fees to specific markets.</Empty>
          ) : (
            <>
              {Object.entries(perMarket).map(([mid, list]) => (
                <div key={mid} className="canvas-surface" style={{ padding: '10px 20px', marginBottom: 16 }} data-testid={`compliance-market-${mid}`}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{marketName(mid)}</div>
                  <ComplianceList items={list} onEdit={openEdit} onDelete={del} />
                </div>
              ))}
            </>
          )}
        </>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit item' : 'Add compliance item'} testId="compliance-modal">
        {modal && (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Type</label>
                <select value={modal.form.type} onChange={e => setModal({ ...modal, form: { ...modal.form, type: e.target.value } })} data-testid="comp-type">
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Scope</label>
                <select value={modal.form.market_id || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, market_id: e.target.value } })}>
                  <option value="">Vendor-wide</option>
                  {markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>Name</label><input required value={modal.form.name} onChange={e => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })} data-testid="comp-name-input" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Issue date</label><input type="date" value={modal.form.issue_date || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, issue_date: e.target.value } })} /></div>
              <div className="field"><label>Expiration date</label><input type="date" required value={modal.form.expiration_date || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, expiration_date: e.target.value } })} data-testid="comp-exp-input" /></div>
            </div>
            <div className="field"><label>Notes</label><textarea rows={2} value={modal.form.notes || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, notes: e.target.value } })} /></div>
            <div className="field"><label>Document (PDF or image)</label><input type="file" accept="application/pdf,image/*" onChange={e => setModal({ ...modal, file: e.target.files?.[0] })} /></div>
            {modal.form.document_filename && !modal.file && (
              <div style={{ fontSize: 12, color: 'var(--charcoal-soft)' }}><FileText size={12} style={{ display: 'inline', marginRight: 4 }} /> Current: {modal.form.document_filename}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn outline" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn primary" disabled={saving} data-testid="comp-save">{saving ? '…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function ComplianceList({ items, onEdit, onDelete }) {
  return (
    <div className="row-list">
      {items.map(c => {
        const dOut = daysUntil(c.expiration_date);
        return (
          <div key={c.id} className="row" data-testid={`comp-row-${c.id}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <StatusPill variant={c.status}>{c.status}</StatusPill>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--charcoal-soft)' }}>
                  <span style={{ textTransform: 'capitalize' }}>{c.type}</span>
                  {' · '}Expires {fmtDate(c.expiration_date)}
                  {dOut !== null && (dOut < 0 ? ` (expired ${-dOut}d ago)` : ` (in ${dOut}d)`)}
                  {c.document_filename && <> · <FileText size={10} style={{ display: 'inline' }} /> {c.document_filename}</>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn ghost tiny" onClick={() => onEdit(c)}><Pencil size={12} /></button>
              <button className="btn ghost tiny" onClick={() => onDelete(c)}><Trash2 size={12} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
