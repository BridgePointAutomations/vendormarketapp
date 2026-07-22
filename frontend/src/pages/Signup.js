import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MARKET_TYPES } from '@/constants/marketTypes';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    // Step 1
    email: '',
    password: '',
    // Step 2
    business_name: '',
    city: '',
    primary_market_type: '',
    expected_markets_count: '',
    owner_name: '',
    phone: '',
    category: 'mixed',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const validateStep1 = () => {
    if (!form.email.trim()) return 'Email is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Enter a valid email';
    if (!form.password || form.password.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const goStep2 = (e) => {
    e.preventDefault();
    const v = validateStep1();
    if (v) { setErr(v); return; }
    setErr('');
    setStep(2);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.business_name.trim()) { setErr('Business name is required'); return; }
    if (!form.primary_market_type) { setErr('Pick your primary market type'); return; }
    setBusy(true);
    try {
      await signup({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        business_name: form.business_name.trim(),
        owner_name: form.owner_name.trim() || null,
        phone: form.phone.trim() || null,
        category: form.category,
        city: form.city.trim() || null,
        primary_market_type: form.primary_market_type,
        expected_markets_count: form.expected_markets_count === '' ? null : Number(form.expected_markets_count),
      });
      navigate('/');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Signup failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" data-testid="signup-card" style={{ maxWidth: 520 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <span className="stamp-badge ready" style={{ transform: 'rotate(-3deg)', fontSize: 12, padding: '10px 18px' }}>MarketOps</span>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 18 }} data-testid="signup-stepper">
          <StepDot n={1} active={step === 1} done={step > 1} label="Account" />
          <div style={{ flex: '0 0 40px', height: 1, borderTop: '1px dashed var(--line-dashed)' }} />
          <StepDot n={2} active={step === 2} done={false} label="Your stall" />
        </div>

        {step === 1 && (
          <>
            <h1 className="display-lg" style={{ marginBottom: 4 }}>Set up shop</h1>
            <p style={{ color: 'var(--charcoal-soft)', marginBottom: 22, fontSize: 14 }}>Step 1 of 2 — create your account.</p>
            <form onSubmit={goStep2} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label htmlFor="signup-email">Email</label>
                <input id="signup-email" type="email" required value={form.email} onChange={upd('email')} data-testid="signup-email" autoComplete="email" />
              </div>
              <div className="field">
                <label htmlFor="signup-password">Password</label>
                <input id="signup-password" type="password" required minLength={6} value={form.password} onChange={upd('password')} data-testid="signup-password" autoComplete="new-password" />
                <div style={{ fontSize: 11, color: 'var(--charcoal-soft)', marginTop: 4 }}>At least 6 characters.</div>
              </div>
              {err && <div className="banner danger" data-testid="signup-error">{err}</div>}
              <button className="btn primary" type="submit" data-testid="signup-next" style={{ marginTop: 4 }}>
                Continue <ArrowRight size={14} />
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="display-lg" style={{ marginBottom: 4 }}>Tell us about your stall</h1>
            <p style={{ color: 'var(--charcoal-soft)', marginBottom: 22, fontSize: 14 }}>Step 2 of 2 — helps us tailor MarketOps to your operation.</p>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label htmlFor="signup-business">Business name</label>
                <input id="signup-business" required value={form.business_name} onChange={upd('business_name')} data-testid="signup-business" />
              </div>

              <div className="grid-2col-wide">
                <div className="field">
                  <label htmlFor="signup-city">City</label>
                  <input id="signup-city" value={form.city} onChange={upd('city')} placeholder="Cleveland, OH" data-testid="signup-city" />
                </div>
                <div className="field">
                  <label htmlFor="signup-expected-count">Markets you&apos;ll run</label>
                  <input
                    id="signup-expected-count"
                    type="number"
                    min={0}
                    max={500}
                    value={form.expected_markets_count}
                    onChange={upd('expected_markets_count')}
                    placeholder="e.g. 4"
                    data-testid="signup-expected-count"
                  />
                </div>
              </div>

              <div className="field">
                <label id="signup-market-type-label">Primary market type</label>
                <div role="group" aria-labelledby="signup-market-type-label" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 4 }} data-testid="signup-market-type-grid">
                  {MARKET_TYPES.map((t) => {
                    const active = form.primary_market_type === t.value;
                    const Icon = t.icon;
                    return (
                      <button
                        type="button"
                        key={t.value}
                        onClick={() => setForm({ ...form, primary_market_type: t.value })}
                        data-testid={`signup-market-type-${t.value}`}
                        className="crate-card"
                        style={{
                          padding: '12px 10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderColor: active ? 'var(--stamp-red)' : 'var(--line)',
                          background: active ? 'rgba(139, 58, 43, 0.06)' : 'var(--canvas)',
                          transition: 'border-color 150ms ease, background 150ms ease, transform 150ms ease',
                          transform: active ? 'translateY(-1px)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Icon size={16} strokeWidth={1.8} color={active ? 'var(--stamp-red)' : 'var(--charcoal-soft)'} />
                          <span className="display-sm" style={{ color: active ? 'var(--stamp-red)' : 'var(--charcoal)' }}>{t.label}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--charcoal-soft)' }}>{t.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid-2col">
                <div className="field">
                  <label htmlFor="signup-owner">Owner name (optional)</label>
                  <input id="signup-owner" value={form.owner_name} onChange={upd('owner_name')} data-testid="signup-owner" />
                </div>
                <div className="field">
                  <label htmlFor="signup-category">Category</label>
                  <select id="signup-category" value={form.category} onChange={upd('category')} data-testid="signup-category">
                    <option value="food">Food</option>
                    <option value="craft">Craft</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="signup-phone">Phone (optional)</label>
                <input id="signup-phone" value={form.phone} onChange={upd('phone')} data-testid="signup-phone" />
              </div>

              {err && <div className="banner danger" data-testid="signup-error">{err}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" className="btn outline" onClick={() => { setErr(''); setStep(1); }} data-testid="signup-back">
                  <ArrowLeft size={14} /> Back
                </button>
                <button className="btn primary" type="submit" disabled={busy} data-testid="signup-submit" style={{ flex: 1 }}>
                  {busy ? '…' : 'Create account'}
                </button>
              </div>
            </form>
          </>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--charcoal-soft)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--stamp-red)', fontWeight: 600 }}>Log in</Link>
        </div>
      </div>
    </div>
  );
}

function StepDot({ n, active, done, label }) {
  const bg = done ? 'var(--crate-green)' : (active ? 'var(--stamp-red)' : 'var(--canvas-2)');
  const color = (done || active) ? '#FDF5EF' : 'var(--charcoal-soft)';
  const border = done ? 'var(--crate-green)' : (active ? 'var(--stamp-red)' : 'var(--line)');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        aria-current={active ? 'step' : undefined}
        data-testid={`signup-step-dot-${n}`}
        style={{
          width: 26, height: 26, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: bg, color, border: `1.5px solid ${border}`,
          fontFamily: 'Oswald, sans-serif', fontSize: 13, fontWeight: 600,
          transition: 'background 150ms ease, border-color 150ms ease',
        }}
      >
        {done ? '✓' : n}
      </div>
      <span className="display-xs" style={{ color: active || done ? 'var(--charcoal)' : 'var(--charcoal-soft)' }}>{label}</span>
    </div>
  );
}
