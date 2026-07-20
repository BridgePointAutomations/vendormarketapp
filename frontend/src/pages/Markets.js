import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { SectionHead, Empty, Modal, StatusPill } from '@/components/ui-market';
import { fmtDate } from '@/lib/format';
import { Plus, Pencil, Trash2, Sparkles, MapPin } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const empty = { name: '', address: '', day_of_week: 'Saturday', season_start: '', season_end: '', category_focus: 'food', is_candidate: false, status: 'considering' };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function Markets() {
  const { vendor } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {form, id?}
  const [saving, setSaving] = useState(false);
  const [fitOpen, setFitOpen] = useState(null); // market id
  const [fitData, setFitData] = useState({});
  const [fitLoading, setFitLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/markets');
      setItems(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => setModal({ form: empty });
  const openEdit = (m) => setModal({ id: m.id, form: { ...m } });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.id) {
        await api.patch(`/markets/${modal.id}`, modal.form);
      } else {
        await api.post('/markets', modal.form);
      }
      setModal(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const del = async (m) => {
    if (!confirm(`Remove ${m.name}? Related allocations will also be removed.`)) return;
    await api.delete(`/markets/${m.id}`);
    load();
  };

  const runFit = async (m) => {
    if (vendor?.tier !== 'paid') return alert('Paid tier required for AI fit evaluation.');
    setFitOpen(m.id);
    setFitLoading(true);
    try {
      const { data } = await api.post('/ai/market-fit', { market_id: m.id });
      setFitData({ [m.id]: data });
    } catch (e) {
      setFitData({ [m.id]: { error: e?.response?.data?.detail || 'AI request failed' } });
    } finally { setFitLoading(false); }
  };

  const enrolled = items.filter(i => !i.is_candidate);
  const candidates = items.filter(i => i.is_candidate);

  return (
    <div>
      <SectionHead title="My Markets">
        <button className="btn primary tiny" onClick={openCreate} data-testid="add-market-btn"><Plus size={13} /> Add market</button>
      </SectionHead>
      <p style={{ color: 'var(--charcoal-soft)', marginBottom: 24, fontSize: 14 }}>
        A private list of the markets you attend. Add ones you're considering to have the AI weigh in.
      </p>

      {loading && <div className="empty">Loading…</div>}

      {!loading && (
        <>
          <div className="display" style={{ marginBottom: 12 }}>Enrolled</div>
          {enrolled.length === 0 ? (
            <Empty title="No enrolled markets">Add the markets you actively sell at.</Empty>
          ) : (
            <div className="canvas-surface" style={{ padding: '10px 20px', marginBottom: 30 }} data-testid="enrolled-list">
              <div className="row-list">
                {enrolled.map(m => <MarketRow key={m.id} m={m} onEdit={openEdit} onDelete={del} />)}
              </div>
            </div>
          )}

          <div className="display" style={{ marginBottom: 12 }}>Considering</div>
          {candidates.length === 0 ? (
            <Empty title="No candidate markets">Add a market you're considering. The AI can weigh in on fit.</Empty>
          ) : (
            <div className="canvas-surface" style={{ padding: '10px 20px' }} data-testid="candidates-list">
              <div className="row-list">
                {candidates.map(m => (
                  <div key={m.id} className="row" data-testid={`market-row-${m.id}`}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--charcoal-soft)' }}>
                        {m.day_of_week || 'Day TBD'} · {m.address || 'No address'} · <StatusPill variant="considering">{m.status}</StatusPill>
                      </div>
                      {fitData[m.id] && !fitData[m.id].error && (
                        <div className="ai-note-block" style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                            <StatusPill variant={fitData[m.id].fit_assessment === 'strong_fit' ? 'active' : fitData[m.id].fit_assessment === 'possible_fit' ? 'expiring' : 'expired'}>
                              {fitData[m.id].fit_assessment?.replace('_', ' ')}
                            </StatusPill>
                            <span style={{ fontSize: 11, color: 'var(--charcoal-soft)' }}>conf: {fitData[m.id].confidence}</span>
                          </div>
                          <div className="ai-note">{fitData[m.id].reason}</div>
                        </div>
                      )}
                      {fitData[m.id]?.error && <div className="banner danger" style={{ marginTop: 8 }}>{fitData[m.id].error}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn outline tiny" onClick={() => runFit(m)} disabled={vendor?.tier !== 'paid' || fitLoading} data-testid={`fit-btn-${m.id}`}>
                        <Sparkles size={12} /> {fitLoading && fitOpen === m.id ? 'Thinking…' : 'AI fit'}
                      </button>
                      <button className="btn ghost tiny" onClick={() => openEdit(m)}><Pencil size={12} /></button>
                      <button className="btn ghost tiny" onClick={() => del(m)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit market' : 'Add market'} testId="market-modal">
        {modal && (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field"><label>Market name</label><input required value={modal.form.name} onChange={e => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })} data-testid="market-name-input" /></div>
            <div className="field"><label>Address</label><input value={modal.form.address || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, address: e.target.value } })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Day of week</label>
                <select value={modal.form.day_of_week || 'Saturday'} onChange={e => setModal({ ...modal, form: { ...modal.form, day_of_week: e.target.value } })}>
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field"><label>Category</label>
                <select value={modal.form.category_focus || 'food'} onChange={e => setModal({ ...modal, form: { ...modal.form, category_focus: e.target.value } })}>
                  <option value="food">Food</option><option value="craft">Craft</option><option value="mixed">Mixed</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Season start</label><input type="date" value={modal.form.season_start || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, season_start: e.target.value } })} /></div>
              <div className="field"><label>Season end</label><input type="date" value={modal.form.season_end || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, season_end: e.target.value } })} /></div>
            </div>
            <div className="field"><label>Enrollment status</label>
              <select value={modal.form.status} onChange={e => setModal({ ...modal, form: { ...modal.form, status: e.target.value, is_candidate: e.target.value === 'considering' } })} data-testid="market-status">
                <option value="considering">Considering</option><option value="applied">Applied</option><option value="approved">Approved</option><option value="active">Active</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn outline" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn primary" disabled={saving} data-testid="market-save">{saving ? '…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function MarketRow({ m, onEdit, onDelete }) {
  return (
    <div className="row" data-testid={`market-row-${m.id}`}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
        <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{m.day_of_week || 'Day TBD'}</span>
          {m.address && <><span>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={10} />{m.address}</span></>}
          <span>·</span>
          <StatusPill variant={m.status === 'active' ? 'active-market' : m.status === 'approved' ? 'approved' : m.status === 'applied' ? 'applied' : 'considering'}>{m.status}</StatusPill>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn ghost tiny" onClick={() => onEdit(m)}><Pencil size={12} /></button>
        <button className="btn ghost tiny" onClick={() => onDelete(m)}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}
