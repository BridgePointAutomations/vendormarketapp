import { useEffect, useMemo, useState, useCallback } from 'react';
import api from '@/lib/api';
import { SectionHead, Empty, AINote } from '@/components/ui-market';
import { fmtCurrency, fmtDate, todayIso } from '@/lib/format';
import { nextWeekdayOccurrence } from '@/lib/recurrence';
import { useAuth } from '@/lib/auth';
import { Sparkles, RefreshCw, Trash2, DollarSign } from 'lucide-react';

export default function Allocate() {
  const { vendor } = useAuth();
  const [markets, setMarkets] = useState([]);
  const [products, setProducts] = useState([]);
  const [allocs, setAllocs] = useState([]);
  const [marketId, setMarketId] = useState('');
  const [marketDate, setMarketDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revenue, setRevenue] = useState(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [restock, setRestock] = useState(null);
  const [restockLoading, setRestockLoading] = useState(false);
  const [pnl, setPnl] = useState(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [boothFeeInput, setBoothFeeInput] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: ms }, { data: ps }] = await Promise.all([
        api.get('/markets'), api.get('/products'),
      ]);
      const enrolled = ms.filter(m => !m.is_candidate);
      setMarkets(enrolled);
      setProducts(ps);
      if (enrolled.length && !marketId) setMarketId(enrolled[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const market = markets.find(m => m.id === marketId);
    if (!market) return;
    if (market.recurrence_pattern === 'weekly' && market.day_of_week) {
      const suggested = nextWeekdayOccurrence(market.day_of_week);
      if (suggested) setMarketDate(suggested);
    }
  }, [marketId, markets]);

  const loadAllocs = async () => {
    if (!marketId || !marketDate) return;
    const { data } = await api.get('/allocations', { params: { market_id: marketId, market_date: marketDate } });
    setAllocs(data);
    // clear AI outputs when context changes
    setRestock(null);
    setRevenue(null);
  };
  useEffect(() => { loadAllocs(); }, [marketId, marketDate]);

  const loadPnl = useCallback(async () => {
    if (!marketId || !marketDate) return;
    setPnlLoading(true);
    try {
      const { data } = await api.get('/pnl/day', { params: { market_id: marketId, market_date: marketDate } });
      setPnl(data);
      // sync input with server-resolved booth fee (may be 0 if none set)
      setBoothFeeInput(data.booth_fee != null ? String(data.booth_fee) : '');
    } catch (e) {
      setPnl(null);
    } finally {
      setPnlLoading(false);
    }
  }, [marketId, marketDate]);
  useEffect(() => { loadPnl(); }, [loadPnl, allocs]);

  const saveBoothFee = async () => {
    if (!marketId || !marketDate) return;
    const val = boothFeeInput === '' ? null : Number(boothFeeInput);
    if (val !== null && (Number.isNaN(val) || val < 0)) return;
    try {
      await api.post('/market-days', { market_id: marketId, market_date: marketDate, booth_fee: val });
      await loadPnl();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to save booth fee');
    }
  };

  const prodMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const allocByProd = useMemo(() => Object.fromEntries(allocs.map(a => [a.product_id, a])), [allocs]);

  const upsert = async (productId, patch) => {
    setSaving(true);
    try {
      const existing = allocByProd[productId];
      if (existing) {
        await api.patch(`/allocations/${existing.id}`, patch);
      } else {
        await api.post('/allocations', {
          market_id: marketId, product_id: productId, market_date: marketDate,
          allocated_qty: patch.allocated_qty ?? 0,
          remaining_qty: patch.remaining_qty ?? patch.allocated_qty ?? 0,
        });
      }
      await loadAllocs();
    } finally { setSaving(false); }
  };

  const removeAlloc = async (id) => {
    await api.delete(`/allocations/${id}`);
    loadAllocs();
  };

  const runRestock = async () => {
    if (vendor?.tier !== 'paid') return alert('Paid tier required for AI restock.');
    setRestockLoading(true);
    try {
      const { data } = await api.post('/ai/restock', { market_id: marketId, market_date: marketDate });
      setRestock(data);
    } catch (e) {
      alert(e?.response?.data?.detail || 'AI restock failed');
    } finally { setRestockLoading(false); }
  };

  const applyRestock = async () => {
    if (!restock) return;
    setSaving(true);
    try {
      // Parallel writes (was: sequential for-of await)
      await Promise.all(
        restock.suggestions
          .filter(s => prodMap[s.product_id])
          .map(s => {
            const qty = Number(s.suggested_qty) || 0;
            const existing = allocByProd[s.product_id];
            if (existing) {
              return api.patch(`/allocations/${existing.id}`, { allocated_qty: qty, remaining_qty: qty });
            }
            return api.post('/allocations', {
              market_id: marketId, product_id: s.product_id, market_date: marketDate,
              allocated_qty: qty, remaining_qty: qty,
            });
          })
      );
      await loadAllocs();
    } finally { setSaving(false); }
  };

  const runRevenue = async () => {
    if (vendor?.tier !== 'paid') return alert('Paid tier required for revenue projection.');
    setRevenueLoading(true);
    try {
      const suggested = allocs.length ? allocs.map(a => ({ product_id: a.product_id, suggested_qty: a.allocated_qty })) : (restock?.suggestions);
      const { data } = await api.post('/ai/revenue', { market_id: marketId, market_date: marketDate, suggested });
      setRevenue(data);
    } catch (e) {
      alert(e?.response?.data?.detail || 'AI revenue projection failed');
    } finally { setRevenueLoading(false); }
  };

  const totalAllocValue = useMemo(() => {
    let t = 0;
    for (const a of allocs) {
      const p = prodMap[a.product_id];
      if (p) t += (Number(a.allocated_qty) || 0) * (Number(p.unit_price) || 0);
    }
    return t;
  }, [allocs, prodMap]);

  const currentMarket = markets.find(m => m.id === marketId);

  if (loading) return <div className="empty">Loading…</div>;

  return (
    <div>
      <SectionHead title="Allocate">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn outline tiny" onClick={runRestock} disabled={restockLoading || vendor?.tier !== 'paid' || !marketId} data-testid="ai-restock-btn">
            <Sparkles size={12} /> {restockLoading ? 'Thinking…' : 'AI restock'}
          </button>
          <button className="btn outline tiny" onClick={runRevenue} disabled={revenueLoading || vendor?.tier !== 'paid' || !marketId || allocs.length === 0} data-testid="ai-revenue-btn">
            <Sparkles size={12} /> {revenueLoading ? 'Thinking…' : 'Project revenue'}
          </button>
        </div>
      </SectionHead>

      <p style={{ color: 'var(--charcoal-soft)', marginBottom: 20, fontSize: 14 }}>Pick a market and date, then set what you&apos;re bringing.</p>

      {markets.length === 0 && <Empty title="No enrolled markets">Add a market first (Markets tab).</Empty>}

      {markets.length > 0 && (
        <>
          <div className="canvas-surface" style={{ padding: 18, marginBottom: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, alignItems: 'end' }}>
              <div className="field">
                <label>Market</label>
                <select value={marketId} onChange={e => setMarketId(e.target.value)} data-testid="alloc-market-select">
                  {markets.map(m => <option key={m.id} value={m.id}>{m.name} ({m.day_of_week || 'day tbd'})</option>)}
                </select>
              </div>
              <div className="field">
                <label>Market date</label>
                <input type="date" value={marketDate} onChange={e => setMarketDate(e.target.value)} data-testid="alloc-date-input" />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="display-xs text-muted">Allocated value</div>
                <div className="number" style={{ fontSize: 26 }}>{fmtCurrency(totalAllocValue)}</div>
              </div>
            </div>
          </div>

          {/* Market-Day P&L card */}
          {pnl && (
            <div className="canvas-surface" style={{ padding: 20, marginBottom: 20 }} data-testid="pnl-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div className="display-xs text-muted">Estimated market-day P&amp;L</div>
                  <div className="display-md" style={{ marginTop: 2 }}>
                    {fmtDate(marketDate)}
                    {pnl.has_actuals && (
                      <span className="stamp-badge ready" style={{ fontSize: 10, marginLeft: 10, padding: '4px 8px', transform: 'rotate(-2deg)' }}>actuals logged</span>
                    )}
                  </div>
                </div>
                <div className="field" style={{ minWidth: 200 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <DollarSign size={11} /> Booth fee (this date)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={boothFeeInput}
                    onChange={(e) => setBoothFeeInput(e.target.value)}
                    onBlur={saveBoothFee}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } }}
                    placeholder={currentMarket?.default_booth_fee != null ? `${currentMarket.default_booth_fee} (market default)` : '0'}
                    data-testid="pnl-booth-fee-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
                <PnlTile label="Revenue" value={fmtCurrency(pnl.revenue)} hint={`${pnl.units_sold} units sold`} testId="pnl-revenue" />
                <PnlTile label="Booth fee" value={fmtCurrency(pnl.booth_fee)} testId="pnl-booth" />
                <PnlTile label="Est. COGS" value={fmtCurrency(pnl.cogs)} hint="From unit costs" testId="pnl-cogs" />
                <PnlTile
                  label="Est. net profit"
                  value={fmtCurrency(pnl.net_profit)}
                  accent={pnl.net_profit >= 0 ? 'positive' : 'negative'}
                  testId="pnl-net"
                />
              </div>

              <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginTop: 12 }}>
                {pnl.has_actuals
                  ? 'Based on your logged actual units sold.'
                  : 'Based on allocated minus remaining. Log actual units sold below for a truer estimate.'}
                {' '}All figures are estimates from your entries — not tax or accounting advice.
              </div>
            </div>
          )}

          {/* Revenue projection callout ABOVE the product grid (per design outline) */}
          {revenue && revenue.insufficient_history && (
            <AINote testId="revenue-insufficient" label="NOT ENOUGH HISTORY YET">
              <div style={{ fontSize: 13 }}>
                {revenue.message} Once you have {revenue.min_required_dates} logged market days, AI projections will unlock.
              </div>
            </AINote>
          )}
          {revenue && !revenue.insufficient_history && (
            <AINote testId="revenue-projection" label="REVENUE & PROFIT PROJECTION">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Oswald', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8f7414' }}>
                  Projection · conf: {revenue.confidence}{revenue.cached ? ' · cached' : ''}
                </span>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Revenue</div>
                    <div className="number" style={{ fontSize: 22, color: 'var(--charcoal)' }} data-testid="revenue-projected-revenue">{fmtCurrency(revenue.projected_revenue)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--charcoal-soft)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Est. Profit</div>
                    <div className="number" style={{ fontSize: 22, color: (revenue.projected_profit || 0) >= 0 ? 'var(--crate-green)' : 'var(--stamp-red)' }} data-testid="revenue-projected-profit">{fmtCurrency(revenue.projected_profit)}</div>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginBottom: 6 }}>
                Revenue &minus; COGS ({fmtCurrency(revenue.projected_cogs)}) &minus; booth fee ({fmtCurrency(revenue.projected_booth_fee)}) = est. profit. Estimates only.
              </div>
              <div>{revenue.rationale}</div>
            </AINote>
          )}

          {restock && restock.insufficient_history && (
            <div className="ai-note-block" style={{ marginTop: 14, borderColor: '#d4b64a', background: '#fdf7e6' }} data-testid="restock-insufficient">
              <div style={{ fontFamily: 'Oswald', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8f7414', marginBottom: 6 }}>
                Not enough history yet
              </div>
              <div className="ai-note" style={{ fontSize: 13 }}>{restock.message}</div>
            </div>
          )}
          {restock && !restock.insufficient_history && (
            <div className="ai-note-block" style={{ marginTop: 14 }} data-testid="restock-block">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: 'Oswald', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8f7414' }}>
                  Restock suggestions{restock.cached ? ' · cached' : ''}
                </span>
                <button className="btn primary tiny" onClick={applyRestock} data-testid="apply-restock"><RefreshCw size={11} /> Apply all</button>
              </div>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {restock.suggestions.map(s => (
                  <li key={s.product_id} className="ai-note" style={{ marginBottom: 4 }}>
                    • <strong>{prodMap[s.product_id]?.name || s.product_id}</strong>: bring {s.suggested_qty} — {s.rationale}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Produce tag grid */}
          <div className="display" style={{ marginTop: 24, marginBottom: 12 }}>Products at {currentMarket?.name} · {fmtDate(marketDate)}</div>
          {products.length === 0 ? (
            <Empty title="No products yet">Add products first, then allocate them to a market.</Empty>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }} data-testid="allocate-grid">
              {products.map(p => {
                const a = allocByProd[p.id];
                const allocated = a?.allocated_qty ?? 0;
                const remaining = a?.remaining_qty ?? 0;
                const isLow = allocated > 0 && allocated < (p.low_stock_threshold || 0);
                const tagClass = !a ? 'ok' : isLow ? 'low' : (remaining <= (p.low_stock_threshold || 0) && remaining < allocated ? 'warn' : 'ok');
                return (
                  <div key={p.id} className={`produce-tag ${tagClass}`} data-testid={`alloc-tag-${p.id}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div className="display-xs text-muted">{p.unit || 'piece'} · {fmtCurrency(p.unit_price)}</div>
                        <div className="display-sm" style={{ fontSize: 15, marginTop: 2, letterSpacing: '0.02em' }}>{p.name}</div>
                      </div>
                      {a && (
                        <button className="btn ghost tiny" onClick={() => removeAlloc(a.id)}><Trash2 size={11} /></button>
                      )}
                    </div>
                    <hr className="dashed-hr" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div className="field">
                        <label>Bring</label>
                        <input type="number" min="0" defaultValue={allocated}
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (v === allocated) return;
                            upsert(p.id, { allocated_qty: v, remaining_qty: a ? Math.min(remaining || v, v) : v });
                          }}
                          data-testid={`alloc-bring-${p.id}`}
                        />
                      </div>
                      <div className="field">
                        <label>Remaining</label>
                        <input type="number" min="0" defaultValue={remaining}
                          disabled={!a}
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (v === remaining) return;
                            upsert(p.id, { remaining_qty: v });
                          }}
                          data-testid={`alloc-remaining-${p.id}`}
                        />
                      </div>
                      <div className="field">
                        <label>Sold</label>
                        <input type="number" min="0" defaultValue={a?.actual_units_sold ?? ''}
                          disabled={!a}
                          placeholder={a ? String(Math.max(0, allocated - remaining)) : ''}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            const v = raw === '' ? null : Number(raw);
                            if (v === (a?.actual_units_sold ?? null)) return;
                            upsert(p.id, { actual_units_sold: v });
                          }}
                          data-testid={`alloc-sold-${p.id}`}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--charcoal-soft)' }}>
                      {a ? `Value: ${fmtCurrency((Number(allocated) || 0) * (Number(p.unit_price) || 0))}` : 'Not scheduled to bring'}
                      {isLow && <span className="text-red" style={{ marginLeft: 8, fontWeight: 600 }}>• below threshold</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PnlTile({ label, value, hint, accent, testId }) {
  const valueColor = accent === 'positive' ? 'var(--crate-green)' : accent === 'negative' ? 'var(--stamp-red)' : 'var(--charcoal)';
  return (
    <div className="stat-block" data-testid={testId}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: valueColor }}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
