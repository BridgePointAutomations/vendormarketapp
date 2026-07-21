import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, Square, Plus, Trash2, GripVertical, Store, ClipboardList, ArrowUp, ArrowDown, Info, Download, Printer,
} from 'lucide-react';
import api from '@/lib/api';
import { SectionHead, Empty } from '@/components/ui-market';
import { fmtDate, todayIso } from '@/lib/format';
import { downloadCsv } from '@/lib/download';

export default function Checklists() {
  const [tab, setTab] = useState('getting-started');
  const [markets, setMarkets] = useState([]);
  const [selectedMarketId, setSelectedMarketId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/markets');
        const enrolled = data.filter((m) => !m.is_candidate);
        setMarkets(enrolled);
        if (enrolled.length && !selectedMarketId) setSelectedMarketId(enrolled[0].id);
      } catch (_) { /* ignore */ }
    })();
  }, []);

  return (
    <div>
      <SectionHead title="Checklists" />
      <p style={{ color: 'var(--charcoal-soft)', marginBottom: 20, fontSize: 14 }}>
        Getting-started items help you orient. Packing lists keep market days smooth.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 22, borderBottom: '1px dashed var(--line-dashed)' }} data-testid="checklist-tabs">
        <TabBtn active={tab === 'getting-started'} onClick={() => setTab('getting-started')} testId="tab-getting-started">
          <ClipboardList size={14} /> Getting started
        </TabBtn>
        <TabBtn active={tab === 'packing'} onClick={() => setTab('packing')} testId="tab-packing">
          <Store size={14} /> Packing lists
        </TabBtn>
      </div>

      {tab === 'getting-started' && <GettingStartedPanel />}
      {tab === 'packing' && (
        <PackingPanel
          markets={markets}
          selectedMarketId={selectedMarketId}
          onSelectMarket={setSelectedMarketId}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="btn ghost"
      style={{
        borderBottom: active ? '2px solid var(--stamp-red)' : '2px solid transparent',
        borderRadius: 0,
        padding: '10px 14px',
        color: active ? 'var(--stamp-red)' : 'var(--charcoal-soft)',
        fontWeight: active ? 600 : 500,
        transition: 'color 150ms ease, border-color 150ms ease',
      }}
    >
      {children}
    </button>
  );
}

/* -------------------- Getting-started -------------------- */
function GettingStartedPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/checklists/getting-started');
      setData(data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (item) => {
    // Optimistic
    setData((prev) => prev && ({
      ...prev,
      items: prev.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)),
    }));
    try {
      await api.patch(`/checklists/items/${item.id}`, { checked: !item.checked });
    } catch (_) {
      load(); // rollback via refetch
    }
  };

  if (loading) return <div className="empty" data-testid="getting-started-loading">Loading getting-started list…</div>;
  if (!data) return null;

  const doneCount = data.items.filter((i) => i.checked).length;
  const total = data.items.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="canvas-surface" style={{ padding: 22 }} data-testid="getting-started-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="display-xs text-muted">Orientation — not legal or jurisdictional advice</div>
          <div className="display-md" style={{ marginTop: 2 }}>Getting your vendor business set up</div>
        </div>
        <div className="number" style={{ fontSize: 15, color: 'var(--charcoal-soft)' }} data-testid="getting-started-progress">{doneCount}/{total} done</div>
      </div>
      <ProgressBar pct={pct} />
      <p style={{ fontSize: 12, color: 'var(--charcoal-soft)', margin: '10px 0 14px 0', lineHeight: 1.5 }}>
        These are common starting points for solo vendors. Requirements vary by state, city, and market — check with your local authority for specifics.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {data.items.map((item) => (
          <GettingStartedRow key={item.id} item={item} onToggle={() => toggle(item)} />
        ))}
      </div>
    </div>
  );
}

function GettingStartedRow({ item, onToggle }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 4px', borderTop: '1px dashed var(--line-dashed)',
      }}
      data-testid={`gs-item-${item.id}`}
    >
      <button
        onClick={onToggle}
        aria-pressed={item.checked}
        aria-label={item.checked ? 'Mark as not done' : 'Mark as done'}
        data-testid={`gs-toggle-${item.id}`}
        style={{
          width: 24, height: 24, borderRadius: '50%',
          background: item.checked ? 'var(--crate-green)' : 'transparent',
          border: `1.5px solid ${item.checked ? 'var(--crate-green)' : 'var(--line-dashed)'}`,
          color: item.checked ? '#FDF5EF' : 'transparent',
          cursor: 'pointer', flexShrink: 0, marginTop: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 150ms ease, border-color 150ms ease',
        }}
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: item.checked ? 'var(--charcoal-soft)' : 'var(--charcoal)', textDecoration: item.checked ? 'line-through' : 'none' }}>
          {item.label}
        </div>
        {item.hint && (
          <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
            <Info size={11} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{item.hint}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Packing -------------------- */
function PackingPanel({ markets, selectedMarketId, onSelectMarket }) {
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [marketDate, setMarketDate] = useState(todayIso());
  const [newItemLabel, setNewItemLabel] = useState('');

  const isPastDate = useMemo(() => marketDate < todayIso(), [marketDate]);

  const load = useCallback(async () => {
    if (!selectedMarketId || !marketDate) return;
    setLoading(true);
    try {
      const { data } = await api.get('/checklists/packing', {
        params: { market_id: selectedMarketId, market_date: marketDate },
      });
      setChecklist(data);
    } finally { setLoading(false); }
  }, [selectedMarketId, marketDate]);
  useEffect(() => { load(); }, [load]);

  const toggleCheck = async (item) => {
    if (!checklist || isPastDate) return;
    const wasChecked = checklist.checked_item_ids.includes(item.id);
    // Optimistic update
    setChecklist((prev) => prev && ({
      ...prev,
      checked_item_ids: wasChecked
        ? prev.checked_item_ids.filter((id) => id !== item.id)
        : [...prev.checked_item_ids, item.id],
    }));
    try {
      await api.post(`/checklists/${checklist.id}/checks`, {
        item_id: item.id, market_date: marketDate, checked: !wasChecked,
      });
    } catch (_) { load(); }
  };

  const addItem = async (e) => {
    e.preventDefault();
    const label = newItemLabel.trim();
    if (!label || !checklist) return;
    try {
      await api.post(`/checklists/${checklist.id}/items`, { label });
      setNewItemLabel('');
      await load();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to add item');
    }
  };

  const removeItem = async (item) => {
    if (!confirm(`Remove "${item.label}" from packing template?`)) return;
    try {
      await api.delete(`/checklists/items/${item.id}`);
      await load();
    } catch (_) { /* ignore */ }
  };

  const moveItem = async (item, direction) => {
    if (!checklist) return;
    const items = [...checklist.items];
    const idx = items.findIndex((i) => i.id === item.id);
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= items.length) return;
    const a = items[idx];
    const b = items[swap];
    try {
      await Promise.all([
        api.patch(`/checklists/items/${a.id}`, { sort_order: b.sort_order }),
        api.patch(`/checklists/items/${b.id}`, { sort_order: a.sort_order }),
      ]);
      await load();
    } catch (_) { /* ignore */ }
  };

  if (markets.length === 0) {
    return (
      <Empty title="No enrolled markets yet">
        Add a market on the <Link to="/markets" style={{ color: 'var(--stamp-red)', fontWeight: 600 }}>Markets</Link> page to start a packing list.
      </Empty>
    );
  }

  const total = checklist?.items?.length || 0;
  const done = checklist?.checked_item_ids?.length || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div className="canvas-surface" style={{ padding: 18, marginBottom: 20 }}>
        <div className="grid-2fr-1fr" style={{ alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="packing-market-select">Market</label>
            <select id="packing-market-select" value={selectedMarketId} onChange={(e) => onSelectMarket(e.target.value)} data-testid="packing-market-select">
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.day_of_week || 'day tbd'})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="packing-date-input">Market date</label>
            <input id="packing-date-input" type="date" value={marketDate} onChange={(e) => setMarketDate(e.target.value)} data-testid="packing-date-input" />
          </div>
        </div>
      </div>

      {loading && <div className="empty">Loading packing list…</div>}

      {!loading && checklist && (
        <div className="canvas-surface" style={{ padding: 22 }} data-testid="packing-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <div>
              <div className="display-xs text-muted">Packing list</div>
              <div className="display-md" style={{ marginTop: 2 }}>{checklist.market_name}</div>
              <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginTop: 2 }}>{fmtDate(marketDate)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="number" style={{ fontSize: 15, color: 'var(--charcoal-soft)' }} data-testid="packing-progress">{done}/{total} packed</div>
              <button
                className="btn outline tiny"
                onClick={async () => {
                  try {
                    await downloadCsv('/checklists/packing/export', `packing_${selectedMarketId}.csv`, {
                      market_id: selectedMarketId,
                      market_date: marketDate || undefined,
                    });
                  } catch (e) {
                    alert(e?.response?.data?.detail || 'Export failed');
                  }
                }}
                data-testid="packing-export-btn"
                title="Download CSV of this packing list"
                disabled={!checklist || total === 0}
              >
                <Download size={12} /> CSV
              </button>
              <button
                className="btn outline tiny"
                onClick={() => window.print()}
                data-testid="packing-print-btn"
                title="Open the browser print dialog"
              >
                <Printer size={12} /> Print
              </button>
            </div>
          </div>
          <ProgressBar pct={pct} />

          {isPastDate && (
            <div className="banner warn" style={{ marginTop: 12 }} data-testid="packing-past-banner">
              This market date has passed — the list resets after market day. Pick today or a future date to check items off.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
            {checklist.items.map((item, idx) => (
              <PackingRow
                key={item.id}
                item={item}
                checked={checklist.checked_item_ids.includes(item.id)}
                onToggle={() => toggleCheck(item)}
                onDelete={() => removeItem(item)}
                onMoveUp={idx > 0 ? () => moveItem(item, 'up') : null}
                onMoveDown={idx < checklist.items.length - 1 ? () => moveItem(item, 'down') : null}
                disabled={isPastDate}
              />
            ))}
          </div>

          <form onSubmit={addItem} style={{ display: 'flex', gap: 8, marginTop: 16 }} data-testid="packing-add-form">
            <input
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              placeholder="Add packing item (e.g. Extension cord)"
              data-testid="packing-add-input"
              style={{
                flex: 1, padding: '10px 12px', fontSize: 13,
                border: '1px solid var(--line)', borderRadius: 6, background: 'var(--canvas)',
                color: 'var(--charcoal)',
              }}
            />
            <button type="submit" className="btn primary tiny" disabled={!newItemLabel.trim()} data-testid="packing-add-btn">
              <Plus size={12} /> Add
            </button>
          </form>

          <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginTop: 12 }}>
            Adding/removing items updates the reusable template for this market. Checked state is only for the current date; the list resets at midnight after the market day.
          </div>
        </div>
      )}
    </div>
  );
}

function PackingRow({ item, checked, onToggle, onDelete, onMoveUp, onMoveDown, disabled }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 4px', borderTop: '1px dashed var(--line-dashed)',
      }}
      data-testid={`packing-item-${item.id}`}
    >
      <GripVertical size={14} color="var(--line-dashed)" style={{ flexShrink: 0 }} />
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={checked}
        aria-label={checked ? 'Uncheck' : 'Check off'}
        data-testid={`packing-toggle-${item.id}`}
        style={{
          width: 22, height: 22, borderRadius: 4,
          background: checked ? 'var(--crate-green)' : 'transparent',
          border: `1.5px solid ${checked ? 'var(--crate-green)' : 'var(--line-dashed)'}`,
          color: checked ? '#FDF5EF' : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 150ms ease, border-color 150ms ease',
        }}
      >
        {checked ? <Check size={12} strokeWidth={3} /> : <Square size={0} />}
      </button>
      <div style={{ flex: 1, fontSize: 14, color: checked ? 'var(--charcoal-soft)' : 'var(--charcoal)', textDecoration: checked ? 'line-through' : 'none' }}>
        {item.label}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn ghost tiny" onClick={onMoveUp} disabled={!onMoveUp} aria-label="Move up" data-testid={`packing-up-${item.id}`}>
          <ArrowUp size={11} />
        </button>
        <button className="btn ghost tiny" onClick={onMoveDown} disabled={!onMoveDown} aria-label="Move down" data-testid={`packing-down-${item.id}`}>
          <ArrowDown size={11} />
        </button>
        <button className="btn ghost tiny" onClick={onDelete} aria-label="Remove item" data-testid={`packing-delete-${item.id}`}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ pct }) {
  return (
    <div
      role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      style={{
        height: 6, background: 'var(--canvas-2)', border: '1px solid var(--line)',
        borderRadius: 999, overflow: 'hidden', marginTop: 6,
      }}
    >
      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--crate-green)', transition: 'width 250ms ease' }} />
    </div>
  );
}
