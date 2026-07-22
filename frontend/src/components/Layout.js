import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, Package, ClipboardList, ShieldCheck, Sparkles, Settings, LogOut, CheckSquare, MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import WelcomeModal from '@/components/WelcomeModal';
import GuidedTour from '@/components/GuidedTour';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: LayoutDashboard, testId: 'nav-dashboard' },
  { to: '/markets', label: 'My Markets', icon: MapPin, testId: 'nav-markets' },
  { to: '/products', label: 'Products', icon: Package, testId: 'nav-products' },
  { to: '/allocate', label: 'Allocate', icon: ClipboardList, testId: 'nav-allocate' },
  { to: '/compliance', label: 'Compliance', icon: ShieldCheck, testId: 'nav-compliance' },
];

const MORE_NAV = [
  { to: '/checklists', label: 'Checklists', icon: CheckSquare, testId: 'nav-checklists' },
  { to: '/ai-insights', label: 'AI Insights', icon: Sparkles, testId: 'nav-ai' },
  { to: '/settings', label: 'Settings', icon: Settings, testId: 'nav-settings' },
];

const NAV = [...PRIMARY_NAV, ...MORE_NAV];

export default function Layout({ children }) {
  const { vendor, logout } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{ marginBottom: 16 }}>
          <div className="brand">
            <span className="brand-mark">MarketOps</span>
          </div>
          <div className="brand-sub">stall to spreadsheet</div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.testId}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <n.icon size={16} strokeWidth={1.8} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginBottom: 6 }}>
            <span className="display-xs">Signed in as</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{vendor?.business_name}</div>
          <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginBottom: 12 }}>{vendor?.email}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span className={`stamp-badge ${vendor?.tier === 'paid' ? 'ready' : 'warn'}`} style={{ transform: 'rotate(-2deg)', fontSize: 9 }}>
              {vendor?.tier === 'paid' ? 'Paid tier' : 'Free tier'}
            </span>
          </div>
          <button onClick={doLogout} data-testid="logout-btn" className="btn ghost tiny" style={{ width: '100%', justifyContent: 'flex-start' }}>
            <LogOut size={13} /> Log out
          </button>
        </div>
      </aside>

      <main className="app-content">
        {children}
      </main>

      <nav className="mobile-tabbar" data-testid="mobile-tabbar">
        {PRIMARY_NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            data-testid={`tab-${n.testId}`}
            className={({ isActive }) => `tabbar-link ${isActive ? 'active' : ''}`}
          >
            <n.icon size={18} strokeWidth={1.8} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="tabbar-link"
          data-testid="tab-more"
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={18} strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" data-testid="mobile-more-sheet">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <nav className="sidebar-nav" style={{ marginTop: 12 }}>
            {MORE_NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={n.testId}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setMoreOpen(false)}
              >
                <n.icon size={16} strokeWidth={1.8} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginBottom: 6 }}>
              <span className="display-xs">Signed in as</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{vendor?.business_name}</div>
            <div style={{ fontSize: 12, color: 'var(--charcoal-soft)', marginBottom: 12 }}>{vendor?.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className={`stamp-badge ${vendor?.tier === 'paid' ? 'ready' : 'warn'}`} style={{ transform: 'rotate(-2deg)', fontSize: 9 }}>
                {vendor?.tier === 'paid' ? 'Paid tier' : 'Free tier'}
              </span>
            </div>
            <button onClick={doLogout} data-testid="logout-btn-mobile" className="btn ghost tiny" style={{ width: '100%', justifyContent: 'flex-start' }}>
              <LogOut size={13} /> Log out
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <WelcomeModal />
      <GuidedTour />
    </div>
  );
}
