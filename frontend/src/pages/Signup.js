import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    business_name: '', owner_name: '', email: '', password: '', phone: '', category: 'mixed',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await signup({ ...form, email: form.email.trim().toLowerCase() });
      navigate('/');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Signup failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" data-testid="signup-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span className="stamp-badge ready" style={{ transform: 'rotate(-3deg)', fontSize: 12, padding: '10px 18px' }}>MarketOps</span>
        </div>
        <h1 className="display-lg" style={{ marginBottom: 4 }}>Set up shop</h1>
        <p style={{ color: 'var(--charcoal-soft)', marginBottom: 22, fontSize: 14 }}>Free tier — upgrade to paid anytime for AI features.</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Business name</label>
            <input required value={form.business_name} onChange={upd('business_name')} data-testid="signup-business" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Owner name</label>
              <input value={form.owner_name} onChange={upd('owner_name')} data-testid="signup-owner" />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={upd('category')} data-testid="signup-category">
                <option value="food">Food</option>
                <option value="craft">Craft</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={form.email} onChange={upd('email')} data-testid="signup-email" autoComplete="email" />
          </div>
          <div className="field">
            <label>Phone (optional)</label>
            <input value={form.phone} onChange={upd('phone')} data-testid="signup-phone" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" required minLength={6} value={form.password} onChange={upd('password')} data-testid="signup-password" autoComplete="new-password" />
          </div>
          {err && <div className="banner danger" data-testid="signup-error">{err}</div>}
          <button className="btn primary" type="submit" disabled={busy} data-testid="signup-submit">{busy ? '…' : 'Create account'}</button>
        </form>
        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--charcoal-soft)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--stamp-red)', fontWeight: 600 }}>Log in</Link>
        </div>
      </div>
    </div>
  );
}
