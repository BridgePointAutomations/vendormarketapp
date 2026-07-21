import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { fmtCurrency } from '@/lib/format';
import { Trophy, TrendingDown } from 'lucide-react';

/**
 * PnlCompareCard — dashboard widget ranking the vendor's enrolled markets
 * by estimated season net profit. Read-only aggregation, no AI, no writes.
 * Skips gracefully when no data has been logged yet.
 */
export default function PnlCompareCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/pnl/compare');
        if (!cancelled) setData(data);
      } catch (e) {
        if (!cancelled) setErr(e?.response?.data?.detail || 'Could not load P&L compare');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || err) return null; // widget is optional; stay silent on failure
  const ranked = (data?.markets || []).filter((r) => r.days_logged > 0);
  if (ranked.length < 2) return null; // useless with < 2 tracked markets

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const maxAbs = Math.max(...ranked.map((r) => Math.abs(r.avg_net_per_day))) || 1;

  return (
    <div className="canvas-surface" style={{ padding: 22, marginBottom: 24 }} data-testid="pnl-compare-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div>
          <div className="display-xs text-muted">Market comparison</div>
          <div className="display" style={{ marginTop: 2 }}>Which markets are earning most?</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', maxWidth: 340, textAlign: 'right' }}>
          Ranked by <strong>average net profit per market day</strong> (estimate, from your entries). Booth fees and unit costs included.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14, marginBottom: 14 }}>
        <MiniCallout
          icon={<Trophy size={14} />}
          label="Best market"
          value={best.market_name}
          detail={`${fmtCurrency(best.avg_net_per_day)}/day · ${best.days_logged} days`}
          accent="positive"
          testId="pnl-best"
        />
        <MiniCallout
          icon={<TrendingDown size={14} />}
          label="Lowest tracked"
          value={worst.market_name}
          detail={`${fmtCurrency(worst.avg_net_per_day)}/day · ${worst.days_logged} days`}
          accent={worst.avg_net_per_day >= 0 ? 'neutral' : 'negative'}
          testId="pnl-worst"
        />
      </div>

      <div className="row-list" data-testid="pnl-compare-list">
        {ranked.map((r) => {
          const width = Math.round((Math.abs(r.avg_net_per_day) / maxAbs) * 100);
          const isNeg = r.avg_net_per_day < 0;
          return (
            <div key={r.market_id} className="row" data-testid={`pnl-row-${r.market_id}`} style={{ padding: '10px 4px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.market_name}</div>
                  <div className="number" style={{ fontSize: 13, color: isNeg ? 'var(--stamp-red)' : 'var(--crate-green)', whiteSpace: 'nowrap' }}>
                    {fmtCurrency(r.avg_net_per_day)}/day
                  </div>
                </div>
                <div style={{ background: 'var(--line-dashed)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${width}%`,
                    height: '100%',
                    background: isNeg ? 'var(--stamp-red)' : 'var(--crate-green)',
                    opacity: 0.7,
                    transition: 'width 250ms ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginTop: 3 }}>
                  {r.days_logged} day{r.days_logged !== 1 && 's'} logged · season net {fmtCurrency(r.net_profit)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginTop: 8 }}>
        Uses only markets where you&apos;ve logged at least one market day. Estimates — not tax or accounting advice.
      </div>
    </div>
  );
}

function MiniCallout({ icon, label, value, detail, accent, testId }) {
  const color = accent === 'positive' ? 'var(--crate-green)' : accent === 'negative' ? 'var(--stamp-red)' : 'var(--charcoal)';
  return (
    <div data-testid={testId} style={{
      border: '1px dashed var(--line-dashed)',
      borderRadius: 8,
      padding: '10px 14px',
      background: 'var(--canvas)',
    }}>
      <div className="stat-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>{icon} {label}</div>
      <div style={{ fontFamily: 'Oswald, sans-serif', fontWeight: 500, fontSize: 16, marginTop: 4, color: 'var(--charcoal)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginTop: 2 }}>{detail}</div>
    </div>
  );
}
