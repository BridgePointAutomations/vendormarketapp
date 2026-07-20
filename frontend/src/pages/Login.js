import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Login failed');
    } finally { setBusy(false); }
  };

  const seedAndLogin = async () => {
    setErr(''); setBusy(true);
    try {
      const { data } = await api.post('/seed/demo');
      await login(data.email, data.password);
      navigate('/');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Seed failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" data-testid="login-card">
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <span className="stamp-badge ready" style={{ transform: 'rotate(-3deg)', fontSize: 12, padding: '10px 18px' }}>MarketOps</span>
          <div className="ai-note" style={{ marginTop: 12, color: 'var(--charcoal-soft)' }}>stall to spreadsheet, in one place</div>
        </div>
        <h1 className="display-lg" style={{ marginBottom: 4 }}>Log in</h1>
        <p style={{ color: 'var(--charcoal-soft)', marginBottom: 22, fontSize: 14 }}>Welcome back, vendor.</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="login-email" autoComplete="email" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} data-testid="login-password" autoComplete="current-password" />
          </div>
          {err && <div className="banner danger" data-testid="login-error">{err}</div>}
          <button className="btn primary" type="submit" disabled={busy} data-testid="login-submit">{busy ? '…' : 'Log in'}</button>
        </form>
        <hr className="dashed-hr" style={{ margin: '22px 0' }} />
        <button className="btn outline" onClick={seedAndLogin} disabled={busy} data-testid="seed-demo-btn" style={{ width: '100%' }}>
          Try demo account
        </button>
        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--charcoal-soft)' }}>
          New vendor? <Link to="/signup" style={{ color: 'var(--stamp-red)', fontWeight: 600 }}>Create an account</Link>
        </div>
      </div>
    </div>
  );
}
