import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { OnboardingProvider } from '@/context/OnboardingContext';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Dashboard from '@/pages/Dashboard';
import Markets from '@/pages/Markets';
import Products from '@/pages/Products';
import Allocate from '@/pages/Allocate';
import Compliance from '@/pages/Compliance';
import AIInsights from '@/pages/AIInsights';
import Settings from '@/pages/Settings';
import OnboardingWizard from '@/pages/OnboardingWizard';
import Checklists from '@/pages/Checklists';

function Protected({ children }) {
  const { vendor, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="display-sm text-muted">Loading…</div>
      </div>
    );
  }
  if (!vendor) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { vendor, loading } = useAuth();
  if (loading) return null;
  if (vendor) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <OnboardingProvider>
            <Routes>
              <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
              <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
              <Route path="/" element={<Protected><Dashboard /></Protected>} />
              <Route path="/markets" element={<Protected><Markets /></Protected>} />
              <Route path="/products" element={<Protected><Products /></Protected>} />
              <Route path="/allocate" element={<Protected><Allocate /></Protected>} />
              <Route path="/compliance" element={<Protected><Compliance /></Protected>} />
              <Route path="/checklists" element={<Protected><Checklists /></Protected>} />
              <Route path="/ai-insights" element={<Protected><AIInsights /></Protected>} />
              <Route path="/settings" element={<Protected><Settings /></Protected>} />
              <Route path="/onboarding" element={<Protected><OnboardingWizard /></Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </OnboardingProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
