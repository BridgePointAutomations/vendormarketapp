import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { SectionHead } from '@/components/ui-market';
import { useOnboarding } from '@/context/OnboardingContext';
import { Sparkles, Check, PlayCircle, Store, RotateCcw } from 'lucide-react';

const MARKET_TYPE_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'farmers', label: "Farmers' Market" },
  { value: 'flea', label: 'Flea Market' },
  { value: 'popup', label: 'Pop-up / Event' },
  { value: 'craft', label: 'Craft Fair' },
  { value: 'mixed', label: 'A little of everything' },
];

export default function SettingsPage() {
  const { vendor, upgrade, downgrade, setVendor, updateOnboarding } = useAuth();
  const { startTour } = useOnboarding();

  const [form, setForm] = useState({
    business_name: vendor?.business_name || '',
    owner_name: vendor?.owner_name || '',
    phone: vendor?.phone || '',
    category: vendor?.category || 'mixed',
    city: vendor?.city || '',
    primary_market_type: vendor?.primary_market_type || '',
    expected_markets_count: vendor?.expected_markets_count ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [tierBusy, setTierBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [onboardingNotice, setOnboardingNotice] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        business_name: form.business_name,
        owner_name: form.owner_name,
        phone: form.phone,
        category: form.category,
        city: form.city || null,
        primary_market_type: form.primary_market_type || null,
        expected_markets_count:
          form.expected_markets_count === '' ? null : Number(form.expected_markets_count),
      };
      const { data } = await api.patch('/auth/me', payload);
      setVendor(data);
      setNotice('Profile updated.');
      setTimeout(() => setNotice(''), 3000);
    } catch (e) {
      setNotice(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const flip = async () => {
    setTierBusy(true);
    try {
      if (vendor?.tier === 'paid') await downgrade();
      else await upgrade();
    } finally { setTierBusy(false); }
  };

  const replayTour = () => {
    startTour();
  };

  const showWelcomeAgain = async () => {
    try {
      await updateOnboarding({ welcome_dismissed: false });
      try { window.sessionStorage.removeItem('mo_welcome_seen_session'); } catch (_) { /* ignore */ }
      setOnboardingNotice('Welcome modal will show again next session.');
      setTimeout(() => setOnboardingNotice(''), 3000);
    } catch (_) {
      setOnboardingNotice('Failed to reset welcome modal.');
    }
  };

  const restoreChecklist = async () => {
    try {
      await updateOnboarding({ checklist_dismissed: false });
      setOnboardingNotice('Dashboard checklist restored.');
      setTimeout(() => setOnboardingNotice(''), 3000);
    } catch (_) {
      setOnboardingNotice('Failed to restore checklist.');
    }
  };

  return (
    <div>
      <SectionHead title="Settings" />

      <div className="grid-2col-wide">
        <div className="canvas-surface" style={{ padding: 22 }}>
          <div className="display" style={{ marginBottom: 14 }}>Vendor profile</div>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label htmlFor="settings-business">Business name</label>
              <input id="settings-business" value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} data-testid="settings-business" />
            </div>
            <div className="grid-2col">
              <div className="field">
                <label htmlFor="settings-owner">Owner name</label>
                <input id="settings-owner" value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="settings-category">Category</label>
                <select id="settings-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="food">Food</option>
                  <option value="craft">Craft</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
            </div>
            <div className="grid-2col-wide">
              <div className="field">
                <label htmlFor="settings-city">City</label>
                <input id="settings-city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Cleveland, OH" data-testid="settings-city" />
              </div>
              <div className="field">
                <label htmlFor="settings-expected-count">Markets you run</label>
                <input
                  id="settings-expected-count"
                  type="number"
                  min={0}
                  max={500}
                  value={form.expected_markets_count}
                  onChange={e => setForm({ ...form, expected_markets_count: e.target.value })}
                  placeholder="e.g. 4"
                  data-testid="settings-expected-count"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="settings-market-type">Primary market type</label>
              <select
                id="settings-market-type"
                value={form.primary_market_type}
                onChange={e => setForm({ ...form, primary_market_type: e.target.value })}
                data-testid="settings-market-type"
              >
                {MARKET_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="settings-phone">Phone</label>
              <input id="settings-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="settings-email">Email</label>
              <input id="settings-email" value={vendor?.email || ''} disabled />
            </div>
            {notice && <div className="banner info">{notice}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn primary" disabled={saving} data-testid="settings-save">{saving ? '…' : 'Save changes'}</button>
            </div>
          </form>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="canvas-surface" style={{ padding: 22 }}>
            <div className="display" style={{ marginBottom: 14 }}>Tier</div>
            <div style={{ marginBottom: 12 }}>
              <span className={`stamp-badge ${vendor?.tier === 'paid' ? 'ready' : 'warn'}`} data-testid="settings-tier-badge">
                {vendor?.tier === 'paid' ? 'Paid tier' : 'Free tier'}
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--charcoal-soft)', marginBottom: 16 }}>
              {vendor?.tier === 'paid'
                ? "You're on the paid tier. AI features (restock, market fit, revenue projections) are unlocked."
                : 'Upgrade to unlock AI restock suggestions, market-fit reviews, and revenue projections.'}
            </p>
            <div style={{ marginBottom: 16 }}>
              <div className="display-xs" style={{ marginBottom: 8 }}>Paid tier includes</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['AI restock suggestions per market', 'AI market-fit evaluations', 'Projected revenue (per day + season rollups)', 'Priority support'].map(t => (
                  <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                    <Check size={14} color="var(--crate-green)" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <button className={`btn ${vendor?.tier === 'paid' ? 'outline' : 'primary'}`} onClick={flip} disabled={tierBusy} style={{ width: '100%' }} data-testid="tier-toggle">
              {tierBusy ? '…' : vendor?.tier === 'paid' ? 'Downgrade to free' : (<><Sparkles size={13} /> Upgrade to paid</>)}
            </button>
            <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginTop: 10, textAlign: 'center' }}>
              Dev toggle — Stripe billing not wired in v1
            </div>
          </div>

          <div className="canvas-surface" style={{ padding: 22 }} data-testid="settings-onboarding-panel">
            <div className="display" style={{ marginBottom: 6 }}>Onboarding</div>
            <p style={{ fontSize: 13, color: 'var(--charcoal-soft)', marginBottom: 14, lineHeight: 1.5 }}>
              Replay the tour, revisit the guided setup, or bring back dashboard prompts you dismissed.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn outline" onClick={replayTour} data-testid="settings-replay-tour">
                <PlayCircle size={14} /> Replay guided tour
              </button>
              <Link to="/onboarding" className="btn outline" data-testid="settings-run-wizard">
                <Store size={14} /> Run setup wizard
              </Link>
              <button className="btn ghost" onClick={showWelcomeAgain} data-testid="settings-show-welcome">
                <RotateCcw size={13} /> Show welcome modal again
              </button>
              {vendor?.checklist_dismissed && (
                <button className="btn ghost" onClick={restoreChecklist} data-testid="settings-restore-checklist">
                  <RotateCcw size={13} /> Restore dashboard checklist
                </button>
              )}
            </div>
            {onboardingNotice && (
              <div className="banner info" style={{ marginTop: 12 }} data-testid="settings-onboarding-notice">{onboardingNotice}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
