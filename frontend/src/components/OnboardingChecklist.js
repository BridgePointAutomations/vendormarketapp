import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { X, Check, Circle, PlayCircle, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/context/OnboardingContext';

/**
 * OnboardingChecklist — persistent "Set up your stall" card shown at top of Dashboard.
 *  - Auto-checks items based on real data (markets/products/compliance/allocations counts).
 *  - Whole-card dismiss via header × (sets vendor.checklist_dismissed=true).
 *  - Never shown when checklist_dismissed=true.
 */
export default function OnboardingChecklist() {
  const { vendor, updateOnboarding } = useAuth();
  const { startTour, checklistRefreshKey } = useOnboarding();
  const [counts, setCounts] = useState({ markets: null, products: null, compliance: null, allocations: null });
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p, c, a] = await Promise.allSettled([
        api.get('/markets'),
        api.get('/products'),
        api.get('/compliance'),
        api.get('/allocations'),
      ]);
      setCounts({
        markets: m.status === 'fulfilled' ? (m.value.data?.length || 0) : 0,
        products: p.status === 'fulfilled' ? (p.value.data?.length || 0) : 0,
        compliance: c.status === 'fulfilled' ? (c.value.data?.length || 0) : 0,
        allocations: a.status === 'fulfilled' ? (a.value.data?.length || 0) : 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, checklistRefreshKey]);

  if (!vendor || vendor.checklist_dismissed) return null;

  const items = [
    {
      key: 'market',
      label: 'Add your first market',
      done: (counts.markets || 0) > 0,
      action: { kind: 'link', to: '/markets', label: 'Add market' },
    },
    {
      key: 'product',
      label: 'Add your first product',
      done: (counts.products || 0) > 0,
      action: { kind: 'link', to: '/products', label: 'Add product' },
    },
    {
      key: 'compliance',
      label: 'Track a compliance item',
      done: (counts.compliance || 0) > 0,
      action: { kind: 'link', to: '/compliance', label: 'Add item' },
    },
    {
      key: 'allocate',
      label: 'Create your first allocation',
      done: (counts.allocations || 0) > 0,
      action: { kind: 'link', to: '/allocate', label: 'Allocate' },
    },
    {
      key: 'tour',
      label: 'Take the guided tour',
      done: !!vendor.tour_completed,
      action: { kind: 'tour', label: 'Start tour' },
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((doneCount / total) * 100);

  const handleDismiss = async () => {
    setDismissing(true);
    try { await updateOnboarding({ checklist_dismissed: true }); } catch (_) { /* ignore */ }
    finally { setDismissing(false); }
  };

  return (
    <div
      className="canvas-surface"
      data-testid="onboarding-checklist"
      style={{ padding: 20, marginBottom: 20, position: 'relative' }}
    >
      <button
        onClick={handleDismiss}
        disabled={dismissing}
        aria-label="Dismiss setup checklist"
        data-testid="checklist-dismiss"
        className="btn ghost tiny"
        style={{ position: 'absolute', top: 10, right: 10, padding: 6 }}
      >
        <X size={14} />
      </button>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6, paddingRight: 32 }}>
        <div>
          <div className="display-xs text-muted">Getting started</div>
          <div className="display-md" style={{ marginTop: 2 }}>Set up your stall</div>
        </div>
        <div className="number" style={{ fontSize: 15, color: 'var(--charcoal-soft)' }} data-testid="checklist-progress">
          {doneCount}/{total} done
        </div>
      </div>

      {/* Progress bar (paper-strip style) */}
      <div
        style={{
          height: 6, background: 'var(--canvas-2)', border: '1px solid var(--line)',
          borderRadius: 999, overflow: 'hidden', marginBottom: 14, marginTop: 6,
        }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            width: `${pct}%`, height: '100%',
            background: 'var(--crate-green)',
            transition: 'width 250ms ease',
          }}
        />
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--charcoal-soft)' }}>Checking your setup…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((item) => (
            <ChecklistRow key={item.key} item={item} onStartTour={startTour} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item, onStartTour }) {
  const doneStyle = {
    color: 'var(--charcoal-soft)',
    textDecoration: 'line-through',
  };
  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 4px', borderTop: '1px dashed var(--line-dashed)',
  };

  return (
    <div style={rowStyle} data-testid={`checklist-item-${item.key}`}>
      {item.done ? (
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--crate-green)', color: '#FDF5EF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }} data-testid={`checklist-check-${item.key}`}>
          <Check size={13} strokeWidth={3} />
        </div>
      ) : (
        <Circle size={22} color="var(--line-dashed)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, fontSize: 14, ...(item.done ? doneStyle : {}) }}>
        {item.label}
      </div>
      <ChecklistAction item={item} onStartTour={onStartTour} />
    </div>
  );
}

function ChecklistAction({ item, onStartTour }) {
  if (item.done) return null;
  if (item.action.kind === 'tour') {
    return (
      <button
        onClick={onStartTour}
        className="btn outline tiny"
        data-testid={`checklist-action-${item.key}`}
      >
        <PlayCircle size={12} /> {item.action.label}
      </button>
    );
  }
  return (
    <Link
      to={item.action.to}
      className="btn outline tiny"
      data-testid={`checklist-action-${item.key}`}
    >
      {item.action.label} <ChevronRight size={12} />
    </Link>
  );
}
