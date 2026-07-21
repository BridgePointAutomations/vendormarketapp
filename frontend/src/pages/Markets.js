import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { SectionHead, Empty, Modal, StatusPill } from '@/components/ui-market';
import SeasonPnlModal from '@/components/SeasonPnlModal';
import { fmtDate } from '@/lib/format';
import { Plus, Pencil, Trash2, Sparkles, MapPin, DollarSign, Copy } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const empty = { name: '', address: '', day_of_week: 'Saturday', recurrence_pattern: 'weekly', season_start: '', season_end: '', category_focus: 'food', is_candidate: false, status: 'considering', default_booth_fee: '', _one_off_date: '' };
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
  const [pnlMarket, setPnlMarket] = useState(null); // {id, name}

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
      const { _one_off_date, ...rest } = modal.form;
      const payload = {
        ...rest,
        default_booth_fee:
          modal.form.default_booth_fee === '' || modal.form.default_booth_fee == null
            ? null
            : Number(modal.form.default_booth_fee),
      };
      let savedId = modal.id;
      if (modal.id) {
        await api.patch(`/markets/${modal.id}`, payload);
      } else {
        const { data } = await api.post('/markets', payload);
        savedId = data.id;
      }
      if (payload.recurrence_pattern === 'one_off' && _one_off_date && savedId) {
        await api.post('/market-days', { market_id: savedId, market_date: _one_off_date });
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

  const [cloning, setCloning] = useState(false);
  const cloneLastSeason = async () => {
    const enrolledCount = items.filter((i) => !i.is_candidate && ['approved', 'active'].includes(i.status)).length;
    if (!enrolledCount) {
      alert("You don't have any approved or active markets to copy yet.");
      return;
    }
    if (!confirm(`Copy ${enrolledCount} enrolled market${enrolledCount !== 1 ? 's' : ''} into fresh "considering" entries for a new season? Existing candidates with the same name are skipped.`)) return;
    setCloning(true);
    try {
      const { data } = await api.post('/markets/clone-active');
      await load();
      if (data.length === 0) {
        alert("Nothing to copy — every enrolled market already has a matching candidate.");
      } else {
        alert(`Created ${data.length} candidate market${data.length !== 1 ? 's' : ''}. Edit season dates and status once you decide.`);
      }
    } catch (e) {
      alert(e?.response?.data?.detail || 'Copy failed');
    } finally { setCloning(false); }
  };

  const [generating, setGenerating] = useState(false);
  const generateSeasonDays = async (marketId) => {
    setGenerating(true);
    try {
      const { data } = await api.post(`/markets/${marketId}/generate-season-days`);
      let msg = `Created ${data.created.length} market day${data.created.length !== 1 ? 's' : ''}.`;
      if (data.skipped_existing.length) msg += ` ${data.skipped_existing.length} already existed.`;
      if (data.outside_range.length) msg += ` ${data.outside_range.length} existing date(s) now fall outside the season — review/remove them on the Allocate page.`;
      alert(msg);
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to generate season dates');
    } finally { setGenerating(false); }
  };

  const enrolled = items.filter(i => !i.is_candidate);
  const candidates = items.filter(i => i.is_candidate);

  return (
    <div>
      <SectionHead title="My Markets">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn outline tiny"
            onClick={cloneLastSeason}
            disabled={cloning}
            data-testid="clone-markets-btn"
            title="Copy your enrolled markets into 'considering' entries so you can plan the next season."
          >
            <Copy size={12} /> {cloning ? 'Copying…' : "Copy last season's markets"}
          </button>
          <button className="btn primary tiny" onClick={openCreate} data-testid="add-market-btn"><Plus size={13} /> Add market</button>
        </div>
      </SectionHead>
      <p style={{ color: 'var(--charcoal-soft)', marginBottom: 24, fontSize: 14 }}>
        A private list of the markets you attend. Add ones you&apos;re considering to have the AI weigh in.
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
                {enrolled.map(m => <MarketRow key={m.id} m={m} onEdit={openEdit} onDelete={del} onOpenPnl={() => setPnlMarket({ id: m.id, name: m.name })} />)}
              </div>
            </div>
          )}

          <div className="display" style={{ marginBottom: 12 }}>Considering</div>
          {candidates.length === 0 ? (
            <Empty title="No candidate markets">Add a market you&apos;re considering. The AI can weigh in on fit.</Empty>
          ) : (
            <div className="canvas-surface" style={{ padding: '10px 20px' }} data-testid="candidates-list">
              <div className="row-list">
                {candidates.map(m => (
                  <div key={m.id} className="row" data-testid={`market-row-${m.id}`}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--charcoal-soft)' }}>
                        <StatusPill variant={m.recurrence_pattern === 'weekly' ? 'active' : 'considering'}>{m.recurrence_pattern === 'weekly' ? 'Weekly' : 'One-time'}</StatusPill> · {m.day_of_week || 'Day TBD'} · {m.address || 'No address'} · <StatusPill variant="considering">{m.status}</StatusPill>
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
            <div className="field">
              <label>Schedule</label>
              <div style={{ display: 'flex', gap: 8 }} data-testid="recurrence-toggle">
                <button
                  type="button"
                  className={`btn tiny ${modal.form.recurrence_pattern === 'weekly' ? 'primary' : 'outline'}`}
                  onClick={() => setModal({ ...modal, form: { ...modal.form, recurrence_pattern: 'weekly' } })}
                  data-testid="recurrence-weekly-btn"
                >Recurring</button>
                <button
                  type="button"
                  className={`btn tiny ${modal.form.recurrence_pattern === 'one_off' ? 'primary' : 'outline'}`}
                  onClick={() => setModal({ ...modal, form: { ...modal.form, recurrence_pattern: 'one_off' } })}
                  data-testid="recurrence-oneoff-btn"
                >One-time</button>
              </div>
            </div>
            {modal.form.recurrence_pattern === 'weekly' ? (
              <div className="field"><label>Day of week</label>
                <select value={modal.form.day_of_week || 'Saturday'} onChange={e => setModal({ ...modal, form: { ...modal.form, day_of_week: e.target.value } })}>
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            ) : (
              <div className="field"><label>Market date</label><input type="date" value={modal.form._one_off_date || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, _one_off_date: e.target.value } })} data-testid="one-off-date-input" /></div>
            )}
            <div className="field"><label>Category</label>
              <select value={modal.form.category_focus || 'food'} onChange={e => setModal({ ...modal, form: { ...modal.form, category_focus: e.target.value } })}>
                <option value="food">Food</option><option value="craft">Craft</option><option value="mixed">Mixed</option>
              </select>
            </div>
            {modal.form.recurrence_pattern === 'weekly' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field"><label>Season start</label><input type="date" value={modal.form.season_start || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, season_start: e.target.value } })} /></div>
                  <div className="field"><label>Season end</label><input type="date" value={modal.form.season_end || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, season_end: e.target.value } })} /></div>
                </div>
                {modal.id && (
                  <div className="field">
                    <button
                      type="button"
                      className="btn outline tiny"
                      onClick={() => generateSeasonDays(modal.id)}
                      disabled={generating || !modal.form.day_of_week || !modal.form.season_start || !modal.form.season_end}
                      title={!modal.form.day_of_week || !modal.form.season_start || !modal.form.season_end ? 'Set day of week and season start/end first' : 'Create a market day for every matching weekday in the season'}
                      data-testid="generate-season-days-btn"
                    >
                      <Sparkles size={12} /> {generating ? 'Generating…' : 'Generate season dates'}
                    </button>
                  </div>
                )}
              </>
            )}
            <div className="field">
              <label>Default booth fee ($)<span style={{ fontSize: 10, color: 'var(--charcoal-soft)', marginLeft: 4 }}>optional</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={modal.form.default_booth_fee ?? ''}
                onChange={e => setModal({ ...modal, form: { ...modal.form, default_booth_fee: e.target.value } })}
                placeholder="e.g. 45"
                data-testid="market-booth-fee-input"
              />
              <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginTop: 4 }}>
                Applied to each market day for this market. You can override per date on the Allocate page.
              </div>
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
      {pnlMarket && (
        <SeasonPnlModal marketId={pnlMarket.id} marketName={pnlMarket.name} onClose={() => setPnlMarket(null)} />
      )}
    </div>
  );
}

function MarketRow({ m, onEdit, onDelete, onOpenPnl }) {
  return (
    <div className="row" data-testid={`market-row-${m.id}`}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
        <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusPill variant={m.recurrence_pattern === 'weekly' ? 'active' : 'considering'}>{m.recurrence_pattern === 'weekly' ? 'Weekly' : 'One-time'}</StatusPill>
          <span>{m.day_of_week || 'Day TBD'}</span>
          {m.address && <><span>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={10} />{m.address}</span></>}
          <span>·</span>
          <StatusPill variant={m.status === 'active' ? 'active-market' : m.status === 'approved' ? 'approved' : m.status === 'applied' ? 'applied' : 'considering'}>{m.status}</StatusPill>
          {m.default_booth_fee != null && (
            <>
              <span>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} data-testid={`market-fee-${m.id}`}>
                <DollarSign size={10} />{m.default_booth_fee} booth
              </span>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn outline tiny" onClick={onOpenPnl} data-testid={`market-pnl-btn-${m.id}`}>
          <DollarSign size={12} /> Season P&amp;L
        </button>
        <button className="btn ghost tiny" onClick={() => onEdit(m)}><Pencil size={12} /></button>
        <button className="btn ghost tiny" onClick={() => onDelete(m)}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}
