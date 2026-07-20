import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { fmtDate } from '@/lib/format';

/**
 * PackingNextCard — tiny Dashboard tile showing packing progress
 * for the next upcoming market day (if any).
 *
 * Silent-fails: if the endpoint fails or there's no upcoming date, renders null.
 */
export default function PackingNextCard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/checklists/packing/next-day');
        if (!cancelled) setData(data);
      } catch (_) { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data || !data.has_upcoming) return null;

  const pct = data.total > 0 ? Math.round((data.checked / data.total) * 100) : 0;
  const complete = data.total > 0 && data.checked === data.total;

  return (
    <Link
      to="/checklists"
      data-testid="dashboard-packing-card"
      style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 20 }}
    >
      <div
        className="canvas-surface"
        style={{
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
          transition: 'border-color 150ms ease',
        }}
      >
        <div
          style={{
            width: 40, height: 40, borderRadius: 8,
            background: complete ? 'var(--crate-green-soft)' : 'var(--canvas-2)',
            border: `1.5px solid ${complete ? 'var(--crate-green)' : 'var(--line-dashed)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <ClipboardList size={18} color={complete ? 'var(--crate-green)' : 'var(--charcoal-soft)'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display-xs text-muted">Next market day</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
            {data.market_name}
            {data.day_of_week && <span style={{ fontWeight: 400, color: 'var(--charcoal-soft)' }}> · {data.day_of_week}, {fmtDate(data.market_date)}</span>}
          </div>
          <div style={{ height: 4, background: 'var(--canvas-2)', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--crate-green)', transition: 'width 250ms ease' }} />
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="number" style={{ fontSize: 22, lineHeight: 1 }} data-testid="packing-card-progress">{data.checked}/{data.total}</div>
          <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginTop: 2 }}>packed</div>
        </div>
        <ChevronRight size={16} color="var(--charcoal-soft)" />
      </div>
    </Link>
  );
}
