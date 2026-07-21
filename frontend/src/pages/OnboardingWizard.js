import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles, Store, Package, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/context/OnboardingContext';

/**
 * OnboardingWizard — optional, always-accessible guided setup at /onboarding.
 *  - Steps: Welcome → Add market → Add product → Add compliance (optional) → Done
 *  - Required fields enforced INSIDE the wizard for market + product.
 *  - Compliance step is skippable.
 *  - On finish: PATCH onboarding_completed=true, refresh checklist, navigate to Dashboard.
 */
export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { updateOnboarding } = useAuth();
  const { refreshChecklist } = useOnboarding();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [market, setMarket] = useState({ name: '', day_of_week: '', address: '', status: 'active' });
  const [product, setProduct] = useState({ name: '', unit: '', unit_price: '', current_stock: '' });
  const [compliance, setCompliance] = useState({ type: 'permit', name: '', expiration_date: '' });
  const [skipCompliance, setSkipCompliance] = useState(false);

  const STEP_META = [
    { label: 'Welcome' },
    { label: 'First market' },
    { label: 'First product' },
    { label: 'Compliance' },
    { label: 'Done' },
  ];

  const isLast = step === STEP_META.length - 1;

  const submitMarket = async () => {
    if (!market.name.trim()) { setErr('Market name is required'); return false; }
    if (!market.day_of_week.trim()) { setErr('Day of week is required'); return false; }
    if (!market.address.trim()) { setErr('Address is required'); return false; }
    setErr('');
    setBusy(true);
    try {
      await api.post('/markets', {
        name: market.name.trim(),
        day_of_week: market.day_of_week.trim(),
        address: market.address.trim(),
        status: market.status,
        recurrence_pattern: 'weekly',
      });
      return true;
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to save market');
      return false;
    } finally { setBusy(false); }
  };

  const submitProduct = async () => {
    if (!product.name.trim()) { setErr('Product name is required'); return false; }
    if (!product.unit.trim()) { setErr('Unit is required (e.g. loaf, jar, piece)'); return false; }
    const price = Number(product.unit_price);
    const stock = Number(product.current_stock);
    if (Number.isNaN(price) || price < 0) { setErr('Unit price must be a non-negative number'); return false; }
    if (Number.isNaN(stock) || stock < 0) { setErr('Current stock must be a non-negative number'); return false; }
    setErr('');
    setBusy(true);
    try {
      await api.post('/products', {
        name: product.name.trim(),
        unit: product.unit.trim(),
        unit_price: price,
        current_stock: stock,
        low_stock_threshold: Math.max(0, Math.floor(stock * 0.25)),
      });
      return true;
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to save product');
      return false;
    } finally { setBusy(false); }
  };

  const submitCompliance = async () => {
    if (skipCompliance) return true;
    if (!compliance.name.trim() || !compliance.expiration_date) {
      setErr('Name and expiration date are required (or skip this step)');
      return false;
    }
    setErr('');
    setBusy(true);
    try {
      await api.post('/compliance', {
        type: compliance.type,
        name: compliance.name.trim(),
        expiration_date: compliance.expiration_date,
      });
      return true;
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to save compliance item');
      return false;
    } finally { setBusy(false); }
  };

  const goNext = async () => {
    let ok = true;
    if (step === 1) ok = await submitMarket();
    else if (step === 2) ok = await submitProduct();
    else if (step === 3) ok = await submitCompliance();
    if (ok) setStep((s) => Math.min(STEP_META.length - 1, s + 1));
  };

  const finish = async () => {
    setBusy(true);
    try {
      await updateOnboarding({ onboarding_completed: true, checklist_dismissed: false });
      refreshChecklist();
    } catch (_) { /* non-fatal */ }
    finally {
      setBusy(false);
      navigate('/');
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '20px auto' }}>
      <div className="canvas-surface" style={{ padding: 26 }} data-testid="onboarding-wizard">
        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
          {STEP_META.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StepDot n={i + 1} active={step === i} done={step > i} />
              <span className="display-xs" style={{ color: step >= i ? 'var(--charcoal)' : 'var(--charcoal-soft)' }}>{s.label}</span>
              {i < STEP_META.length - 1 && (
                <div style={{ width: 20, borderTop: '1px dashed var(--line-dashed)', margin: '0 4px' }} />
              )}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div data-testid="wizard-step-welcome">
            <div style={{ marginBottom: 8 }}>
              <span className="stamp-badge ready" style={{ transform: 'rotate(-3deg)', fontSize: 11 }}>Guided setup</span>
            </div>
            <h1 className="display-lg" style={{ marginBottom: 8 }}>Let&apos;s get your stall ready</h1>
            <p style={{ color: 'var(--charcoal-soft)', fontSize: 14, marginBottom: 22, lineHeight: 1.6 }}>
              We&apos;ll walk through the essentials: add your first market, log a product, and optionally track a compliance item. Everything you enter here is real — you&apos;re building your live workspace.
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              <li style={rowLi}><Store size={16} color="var(--stamp-red)" /> Add your first market</li>
              <li style={rowLi}><Package size={16} color="var(--stamp-red)" /> Add your first product</li>
              <li style={rowLi}><ShieldCheck size={16} color="var(--stamp-red)" /> Track a compliance item <span style={{ fontSize: 11, color: 'var(--charcoal-soft)' }}>(optional)</span></li>
            </ul>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={() => navigate('/')} data-testid="wizard-exit">
                <ArrowLeft size={14} /> Back to Dashboard
              </button>
              <button className="btn primary" onClick={() => setStep(1)} data-testid="wizard-start">
                Let&apos;s go <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div data-testid="wizard-step-market">
            <SectionHeader title="Add your first market" hint="All fields required." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label htmlFor="wizard-market-name">Market name</label>
                <input id="wizard-market-name" value={market.name} onChange={(e) => setMarket({ ...market, name: e.target.value })} placeholder="Shaker Square Farmers Market" data-testid="wizard-market-name" />
              </div>
              <div className="grid-2col">
                <div className="field">
                  <label htmlFor="wizard-market-day">Day of week</label>
                  <select id="wizard-market-day" value={market.day_of_week} onChange={(e) => setMarket({ ...market, day_of_week: e.target.value })} data-testid="wizard-market-day">
                    <option value="">Pick a day…</option>
                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="wizard-market-status">Status</label>
                  <select id="wizard-market-status" value={market.status} onChange={(e) => setMarket({ ...market, status: e.target.value })} data-testid="wizard-market-status">
                    <option value="considering">Considering</option>
                    <option value="applied">Applied</option>
                    <option value="approved">Approved</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="wizard-market-address">Address</label>
                <input id="wizard-market-address" value={market.address} onChange={(e) => setMarket({ ...market, address: e.target.value })} placeholder="13000 Shaker Sq, Cleveland OH" data-testid="wizard-market-address" />
              </div>
            </div>
            <WizardFooter
              onBack={() => setStep(0)}
              onNext={goNext}
              busy={busy}
              err={err}
            />
          </div>
        )}

        {step === 2 && (
          <div data-testid="wizard-step-product">
            <SectionHeader title="Add your first product" hint="All fields required." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label htmlFor="wizard-product-name">Product name</label>
                <input id="wizard-product-name" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Sourdough Loaf" data-testid="wizard-product-name" />
              </div>
              <div className="grid-3col">
                <div className="field">
                  <label htmlFor="wizard-product-unit">Unit</label>
                  <input id="wizard-product-unit" value={product.unit} onChange={(e) => setProduct({ ...product, unit: e.target.value })} placeholder="loaf, jar, piece" data-testid="wizard-product-unit" />
                </div>
                <div className="field">
                  <label htmlFor="wizard-product-price">Unit price ($)</label>
                  <input id="wizard-product-price" type="number" min={0} step="0.01" value={product.unit_price} onChange={(e) => setProduct({ ...product, unit_price: e.target.value })} placeholder="9.00" data-testid="wizard-product-price" />
                </div>
                <div className="field">
                  <label htmlFor="wizard-product-stock">Current stock</label>
                  <input id="wizard-product-stock" type="number" min={0} step="1" value={product.current_stock} onChange={(e) => setProduct({ ...product, current_stock: e.target.value })} placeholder="40" data-testid="wizard-product-stock" />
                </div>
              </div>
            </div>
            <WizardFooter
              onBack={() => setStep(1)}
              onNext={goNext}
              busy={busy}
              err={err}
            />
          </div>
        )}

        {step === 3 && (
          <div data-testid="wizard-step-compliance">
            <SectionHeader title="Track a compliance item" hint="Optional — but strongly recommended." />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={skipCompliance}
                onChange={(e) => setSkipCompliance(e.target.checked)}
                data-testid="wizard-skip-compliance"
                style={{ accentColor: 'var(--stamp-red)' }}
              />
              I&apos;ll add compliance items later
            </label>
            {!skipCompliance && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="grid-2col">
                  <div className="field">
                    <label htmlFor="wizard-compliance-type">Type</label>
                    <select id="wizard-compliance-type" value={compliance.type} onChange={(e) => setCompliance({ ...compliance, type: e.target.value })} data-testid="wizard-compliance-type">
                      <option value="permit">Permit</option>
                      <option value="license">License</option>
                      <option value="insurance">Insurance</option>
                      <option value="tax">Tax</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="wizard-compliance-expiry">Expiration date</label>
                    <input id="wizard-compliance-expiry" type="date" value={compliance.expiration_date} onChange={(e) => setCompliance({ ...compliance, expiration_date: e.target.value })} data-testid="wizard-compliance-expiry" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="wizard-compliance-name">Name</label>
                  <input id="wizard-compliance-name" value={compliance.name} onChange={(e) => setCompliance({ ...compliance, name: e.target.value })} placeholder="Cuyahoga County Vendor Permit" data-testid="wizard-compliance-name" />
                </div>
              </div>
            )}
            <WizardFooter
              onBack={() => setStep(2)}
              onNext={goNext}
              busy={busy}
              err={err}
              nextLabel={skipCompliance ? 'Skip & continue' : 'Save & continue'}
            />
          </div>
        )}

        {isLast && (
          <div data-testid="wizard-step-done" style={{ textAlign: 'center', padding: '20px 10px' }}>
            <div style={{ marginBottom: 14 }}>
              <span className="stamp-badge ready" style={{ transform: 'rotate(-3deg)', fontSize: 12, padding: '10px 18px' }}>Ready</span>
            </div>
            <h1 className="display-lg" style={{ marginBottom: 8 }}>Your stall is set up</h1>
            <p style={{ color: 'var(--charcoal-soft)', fontSize: 14, marginBottom: 22, lineHeight: 1.6 }}>
              Nice work. Head back to the Dashboard — your first market, product, and compliance items are ready.
            </p>
            <button className="btn primary" onClick={finish} disabled={busy} data-testid="wizard-finish">
              {busy ? '…' : (<><Sparkles size={14} /> Go to Dashboard</>)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const rowLi = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 };

function SectionHeader({ title, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 className="display-md" style={{ marginBottom: 4 }}>{title}</h2>
      {hint && <div style={{ fontSize: 12, color: 'var(--charcoal-soft)' }}>{hint}</div>}
    </div>
  );
}

function WizardFooter({ onBack, onNext, busy, err, nextLabel = 'Save & continue' }) {
  return (
    <>
      {err && <div className="banner danger" style={{ marginTop: 14 }} data-testid="wizard-error">{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
        <button className="btn outline" onClick={onBack} disabled={busy} data-testid="wizard-back">
          <ArrowLeft size={14} /> Back
        </button>
        <button className="btn primary" onClick={onNext} disabled={busy} data-testid="wizard-next">
          {busy ? '…' : (<>{nextLabel} <ArrowRight size={14} /></>)}
        </button>
      </div>
    </>
  );
}

function StepDot({ n, active, done }) {
  const bg = done ? 'var(--crate-green)' : (active ? 'var(--stamp-red)' : 'var(--canvas-2)');
  const color = (done || active) ? '#FDF5EF' : 'var(--charcoal-soft)';
  const border = done ? 'var(--crate-green)' : (active ? 'var(--stamp-red)' : 'var(--line)');
  return (
    <div
      aria-current={active ? 'step' : undefined}
      style={{
        width: 24, height: 24, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, color, border: `1.5px solid ${border}`,
        fontFamily: 'Oswald, sans-serif', fontSize: 12, fontWeight: 600,
      }}
    >
      {done ? '✓' : n}
    </div>
  );
}
