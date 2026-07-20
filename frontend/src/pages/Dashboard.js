import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { StatBlock, StampBadge, AINote } from '@/components/ui-market';
import { fmtCurrency, fmtDate, daysUntil } from '@/lib/format';
import { Link } from 'react-router-dom';
import { AlertTriangle, MapPin, Package, Sparkles, ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const { vendor } = useAuth();
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiNote, setAiNote] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // fire reminder sweep + fetch dashboard in parallel
        await api.post('/compliance/sweep').catch(() => {});
        const { data } = await api.get('/dashboard');
        setDash(data);
      } finally { setLoading(false); }
    })();
  }, []);

  const runAiNote = async () => {
    if (!dash || vendor?.tier !== 'paid') return;
    // Pick the earliest upcoming market card
    const next = [...dash.market_cards]
      .filter(m => m.next_date)
      .sort((a, b) => (a.next_date || '').localeCompare(b.next_date || ''))[0];
    if (!next) return;
    setAiLoading(true);
    try {
      const { data } = await api.post('/ai/restock', {
        market_id: next.id, market_date: next.next_date,
      });
      const s = data.suggestions?.[0];
      if (s) {
        setAiNote({
          market: next.name,
          date: next.next_date,
          suggestion: `Bring ~${s.suggested_qty} for your next ${next.name} — ${s.rationale}`,
        });
      }
    } catch (e) {
      setAiNote({ error: e?.response?.data?.detail || 'AI request failed' });
    } finally { setAiLoading(false); }
  };

  if (loading) return <div className="empty" data-testid="dash-loading">Loading your market ledger…</div>;
  if (!dash) return null;

  const s = dash.stats;
  const anyExpiring = dash.action_needed.length > 0;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="display-xs text-muted">Welcome back</div>
        <h1 className="display-lg">{vendor?.business_name}</h1>
      </div>

      {anyExpiring && (
        <div className="banner danger" style={{ marginBottom: 20 }} data-testid="dashboard-alert-banner">
          <AlertTriangle size={16} strokeWidth={2} />
          <span><strong>{dash.action_needed.length}</strong> compliance item{dash.action_needed.length !== 1 && 's'} need attention. <Link to="/compliance" style={{ color: 'var(--stamp-red)', fontWeight: 600 }}>Review</Link></span>
        </div>
      )}

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 26 }}>
        <StatBlock label="Markets this week" value={s.markets_this_week} hint={`${s.total_markets} enrolled overall`} testId="stat-markets" />
        <StatBlock label="Action needed" value={s.action_needed_count} hint="Expiring or expired" testId="stat-action" />
        <StatBlock label="Projected week revenue" value={fmtCurrency(s.projected_week_revenue)} hint={vendor?.tier === 'paid' ? 'From AI projections' : 'Upgrade for AI'} testId="stat-revenue" />
        <StatBlock label="Tier" value={vendor?.tier === 'paid' ? 'PAID' : 'FREE'} hint={vendor?.tier === 'paid' ? 'All features on' : 'AI features locked'} testId="stat-tier" />
      </div>

      {/* Market crate grid */}
      <div className="section-head">
        <h2 className="display">This week at the markets</h2>
        <Link to="/markets" className="btn ghost tiny">Manage <ChevronRight size={12} /></Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18, marginBottom: 30 }}>
        {dash.market_cards.length === 0 && (
          <div className="empty" data-testid="no-markets" style={{ gridColumn: '1 / -1' }}>
            <div className="display-sm">No markets yet</div>
            <Link to="/markets" className="btn outline tiny" style={{ marginTop: 12 }}>Add your first market</Link>
          </div>
        )}
        {dash.market_cards.map((m) => (
          <div key={m.id} className="crate-card" style={{ padding: '22px 20px 18px 20px' }} data-testid={`market-card-${m.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 }}>
              <div>
                <div className="display-sm text-muted">{m.day_of_week || 'Schedule TBD'}</div>
                <div className="display-md" style={{ marginTop: 2 }}>{m.name}</div>
              </div>
              <StampBadge variant={m.ready ? 'ready' : 'action'} testId={`stamp-${m.id}`}>
                {m.ready ? 'Ready' : 'Action needed'}
              </StampBadge>
            </div>
            {m.address && <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginBottom: 10 }}>{m.address}</div>}

            <div className="row-list" style={{ marginTop: 10 }}>
              <div className="row">
                <span className="display-xs">Next date</span>
                <span style={{ fontWeight: 600 }}>{m.next_date ? fmtDate(m.next_date) : 'Not scheduled'}</span>
              </div>
              <div className="row">
                <span className="display-xs">Upcoming allocations</span>
                <span style={{ fontWeight: 600 }}>{m.upcoming_alloc_count}</span>
              </div>
              {m.warnings.length > 0 && (
                <div className="row">
                  <span className="display-xs text-red">Low stock</span>
                  <span className="text-red" style={{ fontWeight: 600 }}>{m.warnings.length}</span>
                </div>
              )}
              {m.compliance_issues.length > 0 && (
                <div className="row">
                  <span className="display-xs text-red">Compliance</span>
                  <span className="text-red" style={{ fontWeight: 600 }}>{m.compliance_issues.length} issue{m.compliance_issues.length !== 1 && 's'}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Single AI note slot at the bottom (per design outline: 'One AI note (restock) at the bottom, chalkboard-hand style') */}
      {vendor?.tier === 'paid' && dash.market_cards.some(m => m.next_date) && (
        <div>
          <div className="section-head">
            <h2 className="display">One from the AI helper</h2>
            <button onClick={runAiNote} disabled={aiLoading} className="btn outline tiny" data-testid="ai-note-refresh">
              <Sparkles size={12} /> {aiLoading ? 'Thinking…' : (aiNote ? 'Regenerate' : 'Generate')}
            </button>
          </div>
          {aiNote?.error && <div className="banner danger">{aiNote.error}</div>}
          {aiNote?.suggestion && (
            <AINote testId="ai-note">{aiNote.suggestion}</AINote>
          )}
          {!aiNote && !aiLoading && (
            <div className="empty" style={{ padding: 24 }}>
              <div className="display-sm" style={{ marginBottom: 6 }}>Ready when you are</div>
              <div style={{ fontSize: 14, marginBottom: 12 }}>Ask the AI helper for a quick restock note on your next market day.</div>
              <button onClick={runAiNote} className="btn primary tiny" data-testid="ai-note-generate">Generate a note</button>
            </div>
          )}
        </div>
      )}
      {vendor?.tier !== 'paid' && (
        <div className="banner warn" style={{ marginTop: 14 }} data-testid="upgrade-banner">
          <Sparkles size={14} />
          <span>Unlock restock hints, market-fit reviews, and revenue projections — <Link to="/settings" style={{ fontWeight: 600, color: '#8f7414' }}>upgrade in Settings</Link></span>
        </div>
      )}
    </div>
  );
}
