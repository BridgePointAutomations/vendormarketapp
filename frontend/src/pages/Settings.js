import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { SectionHead } from '@/components/ui-market';
import { Sparkles, Check } from 'lucide-react';

export default function Settings() {
  const { vendor, upgrade, downgrade, setVendor } = useAuth();
  const [form, setForm] = useState({
    business_name: vendor?.business_name || '',
    owner_name: vendor?.owner_name || '',
    phone: vendor?.phone || '',
    category: vendor?.category || 'mixed',
  });
  const [saving, setSaving] = useState(false);
  const [tierBusy, setTierBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/me', form);
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

  return (
    <div>
      <SectionHead title="Settings" />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        <div className="canvas-surface" style={{ padding: 22 }}>
          <div className="display" style={{ marginBottom: 14 }}>Vendor profile</div>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field"><label>Business name</label><input value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} data-testid="settings-business" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Owner name</label><input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} /></div>
              <div className="field"><label>Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="food">Food</option><option value="craft">Craft</option><option value="mixed">Mixed</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={vendor?.email || ''} disabled /></div>
            {notice && <div className="banner info">{notice}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn primary" disabled={saving} data-testid="settings-save">{saving ? '…' : 'Save changes'}</button>
            </div>
          </form>
        </div>

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
      </div>
    </div>
  );
}
