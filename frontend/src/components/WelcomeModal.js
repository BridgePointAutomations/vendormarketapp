import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, PlayCircle, Store, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/context/OnboardingContext';
import { useDialogA11y } from '@/hooks/use-dialog-a11y';

const SESSION_KEY = 'mo_welcome_seen_session';

/**
 * WelcomeModal
 *  - Shows once per browser session for vendors whose `welcome_dismissed` is false.
 *  - Session flag prevents re-showing on page navigation within the same tab session.
 *  - The vendor-level `welcome_dismissed` flag makes it persistent across sessions.
 *  - CTAs "Take the tour" and "Set up my first market" auto-dismiss forever.
 *  - Closing via × or "Maybe later" does NOT persist — the modal will show again next session.
 *  - Checkbox "Don't show this again" persists the dismissal.
 */
export default function WelcomeModal() {
  const { vendor, updateOnboarding } = useAuth();
  const { startTour } = useOnboarding();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    if (vendor.welcome_dismissed) return;
    let seen = false;
    try { seen = window.sessionStorage.getItem(SESSION_KEY) === '1'; } catch (_) { /* private mode */ }
    if (seen) return;
    setOpen(true);
    try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch (_) { /* ignore */ }
  }, [vendor]);

  const persistDismiss = async () => {
    setBusy(true);
    try { await updateOnboarding({ welcome_dismissed: true }); } catch (_) { /* non-fatal */ }
    finally { setBusy(false); }
  };

  const handleTakeTour = async () => {
    setOpen(false);
    await persistDismiss();
    startTour();
  };

  const handleSetupWizard = async () => {
    setOpen(false);
    await persistDismiss();
    navigate('/onboarding');
  };

  const handleMaybeLater = async () => {
    if (dontShowAgain) {
      await persistDismiss();
    }
    setOpen(false);
  };

  useDialogA11y(open, handleMaybeLater);

  if (!open || !vendor) return null;

  return (
    <div className="modal-overlay" onClick={handleMaybeLater} data-testid="welcome-modal-overlay">
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        data-testid="welcome-modal"
      >
        <button
          onClick={handleMaybeLater}
          className="btn ghost tiny"
          aria-label="Close welcome"
          data-testid="welcome-modal-close"
          style={{ position: 'absolute', top: 12, right: 12, padding: 6 }}
        >
          <X size={16} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 14, marginTop: 4 }}>
          <span className="stamp-badge ready" style={{ transform: 'rotate(-3deg)', fontSize: 11, padding: '8px 14px' }}>Welcome</span>
        </div>

        <h3 id="welcome-modal-title" className="display-lg" style={{ marginBottom: 8, textAlign: 'center' }}>
          Hey {vendor.business_name?.split(' ')[0] || 'vendor'} — welcome to MarketOps
        </h3>
        <p style={{ color: 'var(--charcoal-soft)', fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
          A quick two-minute tour will show you how markets, products, and compliance fit together. Or jump into a guided setup for your first market.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn primary"
            onClick={handleTakeTour}
            disabled={busy}
            data-testid="welcome-modal-take-tour"
            style={{ justifyContent: 'center' }}
          >
            <PlayCircle size={15} /> Take the 2-minute tour
          </button>
          <button
            className="btn outline"
            onClick={handleSetupWizard}
            disabled={busy}
            data-testid="welcome-modal-setup-wizard"
            style={{ justifyContent: 'center' }}
          >
            <Store size={15} /> Set up my first market
          </button>
        </div>

        <hr className="dashed-hr" style={{ margin: '18px 0 14px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <label
            htmlFor="welcome-dont-show"
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--charcoal-soft)', cursor: 'pointer', userSelect: 'none' }}
          >
            <input
              id="welcome-dont-show"
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              data-testid="welcome-modal-dont-show"
              style={{ width: 15, height: 15, accentColor: 'var(--stamp-red)', cursor: 'pointer' }}
            />
            Don&apos;t show this again
          </label>
          <button
            className="btn ghost tiny"
            onClick={handleMaybeLater}
            data-testid="welcome-modal-maybe-later"
          >
            Maybe later
          </button>
        </div>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--charcoal-soft)', justifyContent: 'center' }}>
          <Sparkles size={11} /> You can start these anytime from Settings.
        </div>
      </div>
    </div>
  );
}
