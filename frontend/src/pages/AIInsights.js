import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { SectionHead, Empty, StatBlock, AINote, StatusPill } from '@/components/ui-market';
import { fmtCurrency, fmtDate, todayIso } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useRestockSuggestion } from '@/hooks/useRestockSuggestion';
import { useMarketFit } from '@/hooks/useMarketFit';
import { Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AIInsights() {
  const { vendor } = useAuth();
  const [markets, setMarkets] = useState([]);
  const [rollups, setRollups] = useState({}); // market_id -> rollup
  const { getRestock, runRestock: runRestockSuggestion, isLoading: isRestockLoading } = useRestockSuggestion();
  const { fits, busyId: fitBusyId, runFit: runFitSuggestion } = useMarketFit();
  const [selectedMarket, setSelectedMarket] = useState('');
  const [restockDate, setRestockDate] = useState(todayIso());
  const restockBusy = isRestockLoading(selectedMarket, restockDate);
  const selectedRestock = getRestock(selectedMarket, restockDate);

  useEffect(() => {
    (async () => {
      const { data } = await api.get('/markets');
      setMarkets(data);
      const enrolled = data.filter(m => !m.is_candidate);
      if (enrolled.length) setSelectedMarket(enrolled[0].id);
      if (vendor?.tier === 'paid' && enrolled.length) {
        // Fetch all rollups in parallel (was: sequential await-in-loop)
        const results = await Promise.allSettled(
          enrolled.map(m => api.get(`/ai/revenue/rollup/${m.id}`).then(r => [m.id, r.data]))
        );
        const map = {};
        for (const res of results) {
          if (res.status === 'fulfilled') {
            const [id, r] = res.value;
            map[id] = r;
          }
        }
        if (Object.keys(map).length) setRollups(prev => ({ ...prev, ...map }));
      }
    })();
  }, [vendor?.tier]);

  const runRestock = async () => {
    if (!selectedMarket) return;
    try {
      await runRestockSuggestion(selectedMarket, restockDate);
    } catch (e) {
      alert(e?.response?.data?.detail || 'AI restock failed');
    }
  };

  const runFit = async (mid) => {
    await runFitSuggestion(mid);
  };

  const enrolled = markets.filter(m => !m.is_candidate);
  const candidates = markets.filter(m => m.is_candidate);

  // Season totals
  const totalAvg = Object.values(rollups).reduce((s, r) => s + (r?.avg_per_visit || 0), 0);
  const totalVisits = Object.values(rollups).reduce((s, r) => s + (r?.visits || 0), 0);
  const grandTotal = Object.values(rollups).reduce((s, r) => s + (r?.total || 0), 0);
  const grandProfit = Object.values(rollups).reduce((s, r) => s + (r?.total_profit || 0), 0);

  if (vendor?.tier !== 'paid') {
    return (
      <div>
        <SectionHead title="AI Insights" />
        <div className="canvas-surface" style={{ padding: '40px 32px', textAlign: 'center', maxWidth: 620, margin: '20px auto' }} data-testid="ai-paywall">
          <span className="stamp-badge warn" style={{ transform: 'rotate(-3deg)' }}>Paid tier only</span>
          <h2 className="display-md" style={{ marginTop: 18 }}>Unlock the AI helper</h2>
          <p style={{ color: 'var(--charcoal-soft)', margin: '10px 0 22px 0', fontSize: 14 }}>
            Restock suggestions, market-fit reviews, and revenue projections &mdash; all in one place.
          </p>
          <Link to="/settings" className="btn primary" data-testid="upgrade-cta">Upgrade in Settings</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHead title="AI Insights" />
      <p style={{ color: 'var(--charcoal-soft)', marginBottom: 20, fontSize: 14 }}>
        All three AI features together: season-rollup revenue, restock notes, and market-fit evaluations.
      </p>

      {/* Season stat row */}
      <div className="grid-4up" style={{ marginBottom: 26 }}>
        <StatBlock label="Average per visit" value={fmtCurrency(totalAvg)} hint="Sum of per-market avg" testId="stat-avg" />
        <StatBlock label="Total visits projected" value={totalVisits} hint="Across the season so far" testId="stat-visits" />
        <StatBlock label="Season projected revenue" value={fmtCurrency(grandTotal)} hint="All cached projections" testId="stat-grand" />
        <StatBlock label="Season projected profit" value={fmtCurrency(grandProfit)} hint="Revenue &minus; costs &minus; fees" testId="stat-profit" />
      </div>

      {/* Per-market rollup */}
      <div className="display" style={{ marginBottom: 10 }}>Per-market rollup</div>
      {enrolled.length === 0 ? (
        <Empty title="No enrolled markets">Add a market and run a revenue projection to see rollups.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 30 }}>
          {enrolled.map(m => {
            const r = rollups[m.id];
            const trend = r?.trend || 'flat';
            const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
            return (
              <div key={m.id} className="crate-card" style={{ padding: 20 }} data-testid={`rollup-${m.id}`}>
                <div className="display-sm text-muted">{m.day_of_week || 'Schedule TBD'}</div>
                <div className="display-md" style={{ marginTop: 2, marginBottom: 12 }}>{m.name}</div>
                {r && r.visits > 0 ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div className="number" style={{ fontSize: 30 }}>{fmtCurrency(r.avg_per_visit)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: trend === 'up' ? 'var(--crate-green)' : trend === 'down' ? 'var(--stamp-red)' : 'var(--charcoal-soft)', fontSize: 12 }}>
                        <TrendIcon size={14} /> {trend}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginTop: 2 }}>avg revenue / visit · {r.visits} visit{r.visits !== 1 && 's'}</div>
                    {(r.avg_profit_per_visit || r.total_profit) ? (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--charcoal-line)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }} data-testid={`rollup-profit-${m.id}`}>
                        <span style={{ color: 'var(--charcoal-soft)' }}>Est. profit / visit</span>
                        <span className="number" style={{ color: (r.avg_profit_per_visit || 0) >= 0 ? 'var(--crate-green)' : 'var(--stamp-red)' }}>{fmtCurrency(r.avg_profit_per_visit)}</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--charcoal-soft)' }}>
                    No cached projections yet. Run one from Allocate.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Restock generator */}
      <div className="display" style={{ marginBottom: 10 }}>Restock helper</div>
      <div className="canvas-surface" style={{ padding: 18, marginBottom: 20 }}>
        <div className="grid-3col-auto" style={{ alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="insights-market-select">Market</label>
            <select id="insights-market-select" value={selectedMarket} onChange={e => setSelectedMarket(e.target.value)} data-testid="insights-market-select">
              {enrolled.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="insights-restock-date">Date</label>
            <input id="insights-restock-date" type="date" value={restockDate} onChange={e => setRestockDate(e.target.value)} data-testid="insights-restock-date" />
          </div>
          <button className="btn primary" onClick={runRestock} disabled={restockBusy || !selectedMarket} data-testid="insights-restock-btn">
            <Sparkles size={13} /> {restockBusy ? 'Thinking…' : 'Generate'}
          </button>
        </div>

        {selectedRestock && selectedRestock.insufficient_history && (
          <div className="ai-note-block" style={{ marginTop: 16, borderColor: '#d4b64a', background: '#fdf7e6' }} data-testid="insights-restock-insufficient">
            <div className="display-xs text-muted" style={{ marginBottom: 4 }}>Not enough history yet</div>
            <div className="ai-note">{selectedRestock.message}</div>
          </div>
        )}
        {selectedRestock && !selectedRestock.insufficient_history && (
          <div className="ai-note-block" style={{ marginTop: 16 }}>
            <div className="display-xs text-muted" style={{ marginBottom: 4 }}>
              Suggested for {fmtDate(selectedRestock.market_date)}{selectedRestock.cached ? ' · cached' : ''}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {selectedRestock.suggestions.map(s => (
                <li key={s.product_id} className="ai-note" style={{ marginBottom: 3 }}>
                  • Bring {s.suggested_qty} — {s.rationale}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Market fit for candidates */}
      <div className="display" style={{ marginBottom: 10 }}>Fit evaluations &mdash; markets you&apos;re considering</div>
      {candidates.length === 0 ? (
        <Empty title="No candidate markets">Add a market as &ldquo;considering&rdquo; on the Markets page. The AI will weigh in here.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {candidates.map(m => {
            const f = fits[m.id];
            return (
              <div key={m.id} className="crate-card" style={{ padding: 20 }} data-testid={`fit-card-${m.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div className="display-sm text-muted">{m.day_of_week || 'Day TBD'}</div>
                    <div className="display-md" style={{ marginTop: 2 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginTop: 4 }}>{m.address}</div>
                  </div>
                </div>
                {f?.error && <div className="banner danger" style={{ marginTop: 12 }}>{f.error}</div>}
                {f && !f.error && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <StatusPill variant={f.fit_assessment === 'strong_fit' ? 'active' : f.fit_assessment === 'possible_fit' ? 'expiring' : 'expired'}>
                        {f.fit_assessment?.replace('_', ' ')}
                      </StatusPill>
                      <span style={{ fontSize: 11, color: 'var(--charcoal-soft)' }}>conf: {f.confidence}</span>
                    </div>
                    <div className="ai-note">{f.reason}</div>
                  </div>
                )}
                <button className="btn outline tiny" style={{ marginTop: 12 }} onClick={() => runFit(m.id)} disabled={fitBusyId === m.id} data-testid={`insights-fit-btn-${m.id}`}>
                  <Sparkles size={12} /> {fitBusyId === m.id ? 'Thinking…' : (f ? 'Regenerate' : 'Get fit')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
