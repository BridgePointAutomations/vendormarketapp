import { useEffect, useState } from 'react';
import { X, TrendingUp, TrendingDown, Minus, Download, Printer } from 'lucide-react';
import api from '@/lib/api';
import { fmtCurrency, fmtDate } from '@/lib/format';
import { downloadCsv } from '@/lib/download';

/**
 * SeasonPnlModal — read-only view of estimated season P&L for a single market.
 *  - Fetches /pnl/season/:market_id
 *  - Shows totals + per-market-date table
 *  - All figures labeled "Estimate based on your entries" (no accounting claims).
 */
export default function SeasonPnlModal({ marketId, marketName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/pnl/season/${marketId}`);
        if (!cancelled) setData(data);
      } catch (e) {
        if (!cancelled) setErr(e?.response?.data?.detail || 'Failed to load season P&L');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [marketId]);

  const totals = data?.totals;
  const net = totals?.net_profit ?? 0;
  const trendIcon = net > 0 ? <TrendingUp size={14} color="var(--crate-green)" /> : net < 0 ? <TrendingDown size={14} color="var(--stamp-red)" /> : <Minus size={14} color="var(--charcoal-soft)" />;

  return (
    <div className="modal-overlay" onClick={onClose} data-testid="season-pnl-overlay">
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()} data-testid="season-pnl-modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div className="display-xs text-muted">Season P&amp;L</div>
            <div className="display-md" style={{ marginTop: 2 }}>{marketName}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={async () => {
                try {
                  await downloadCsv(`/pnl/season/${marketId}/export`, `season_pnl_${marketId}.csv`);
                } catch (e) {
                  alert(e?.response?.data?.detail || 'Export failed');
                }
              }}
              className="btn outline tiny"
              disabled={loading || !data || !data.days || data.days.length === 0}
              data-testid="season-pnl-export"
              title="Download CSV for spreadsheets or tax records"
            >
              <Download size={12} /> CSV
            </button>
            <button
              onClick={() => window.print()}
              className="btn outline tiny"
              disabled={loading || !data}
              data-testid="season-pnl-print"
              title="Open browser print dialog"
            >
              <Printer size={12} /> Print
            </button>
            <button onClick={onClose} aria-label="Close" className="btn ghost tiny" data-testid="season-pnl-close" style={{ padding: 6 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginBottom: 16 }}>
          All figures are estimates based on what you&apos;ve entered — not tax or accounting advice.
        </p>

        {loading && <div className="empty" style={{ padding: 24 }} data-testid="season-pnl-loading">Loading season summary…</div>}
        {err && <div className="banner danger">{err}</div>}

        {!loading && data && (
          <>
            {/* Totals row */}
            <div className="grid-4up" style={{ marginBottom: 18 }}>
              <TotalTile label="Days logged" value={String(data.days_logged)} hint={`${data.days_with_actuals} with actuals`} testId="season-days" />
              <TotalTile label="Revenue" value={fmtCurrency(totals.revenue)} testId="season-revenue" />
              <TotalTile label="Booth + COGS" value={fmtCurrency((totals.booth_fee || 0) + (totals.cogs || 0))} hint={`fees ${fmtCurrency(totals.booth_fee)} · COGS ${fmtCurrency(totals.cogs)}`} testId="season-costs" />
              <TotalTile
                label="Est. net profit"
                value={fmtCurrency(totals.net_profit)}
                hint={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{trendIcon} avg {fmtCurrency(data.avg_net_per_day)}/day</span>}
                accent={net >= 0 ? 'positive' : 'negative'}
                testId="season-net"
              />
            </div>

            {/* Per-day table */}
            {data.days.length === 0 ? (
              <div className="empty" data-testid="season-pnl-empty" style={{ padding: 20 }}>
                <div className="display-sm" style={{ marginBottom: 6 }}>No market days logged yet</div>
                <div style={{ fontSize: 13 }}>Allocate products to a market date on the Allocate page to start tracking P&amp;L.</div>
              </div>
            ) : (
              <div className="canvas-surface" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} data-testid="season-pnl-table">
                  <thead>
                    <tr style={{ borderBottom: '1px dashed var(--line-dashed)' }}>
                      <Th>Date</Th>
                      <Th align="right">Units sold</Th>
                      <Th align="right">Revenue</Th>
                      <Th align="right">Booth</Th>
                      <Th align="right">COGS</Th>
                      <Th align="right">Est. net</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d) => (
                      <tr key={d.market_date} data-testid={`season-day-${d.market_date}`} style={{ borderBottom: '1px dashed var(--line-dashed)' }}>
                        <Td>
                          {fmtDate(d.market_date)}
                          {d.has_actuals && (
                            <span className="stamp-badge ready" style={{ fontSize: 9, marginLeft: 8, padding: '3px 7px', transform: 'rotate(-1deg)' }}>actual</span>
                          )}
                        </Td>
                        <Td align="right">{d.units_sold}</Td>
                        <Td align="right">{fmtCurrency(d.revenue)}</Td>
                        <Td align="right">{fmtCurrency(d.booth_fee)}</Td>
                        <Td align="right">{fmtCurrency(d.cogs)}</Td>
                        <Td align="right">
                          <span style={{ fontWeight: 600, color: d.net_profit >= 0 ? 'var(--crate-green)' : 'var(--stamp-red)' }}>
                            {fmtCurrency(d.net_profit)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TotalTile({ label, value, hint, accent, testId }) {
  const valueColor = accent === 'positive' ? 'var(--crate-green)' : accent === 'negative' ? 'var(--stamp-red)' : 'var(--charcoal)';
  return (
    <div className="stat-block" data-testid={testId}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: valueColor }}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      textAlign: align,
      fontFamily: 'Oswald, sans-serif',
      fontSize: 11,
      letterSpacing: '0.12em',
      color: 'var(--charcoal-soft)',
      padding: '10px 12px',
      textTransform: 'uppercase',
      fontWeight: 500,
    }}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }) {
  return <td style={{ textAlign: align, padding: '10px 12px', color: 'var(--charcoal)' }}>{children}</td>;
}
