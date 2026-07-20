import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth';

const OnboardingCtx = createContext(null);

/**
 * OnboardingProvider centralises onboarding UX flows:
 *  - tourActive: whether the guided tour overlay is currently visible
 *  - startTour(): triggers the guided tour (also auto-dismisses the welcome modal permanently)
 *  - endTour({completed}): dismisses the tour; on completion also persists tour_completed=true
 *  - checklistRefreshKey / refreshChecklist(): bump to re-fetch checklist counts after actions
 */
export const OnboardingProvider = ({ children }) => {
  const { vendor, updateOnboarding } = useAuth();
  const [tourActive, setTourActive] = useState(false);
  const [checklistRefreshKey, setChecklistRefreshKey] = useState(0);

  const startTour = useCallback(async () => {
    setTourActive(true);
    // Any explicit engagement with the tour dismisses the welcome modal permanently.
    if (vendor && !vendor.welcome_dismissed) {
      try { await updateOnboarding({ welcome_dismissed: true }); } catch (_) { /* non-fatal */ }
    }
  }, [vendor, updateOnboarding]);

  const endTour = useCallback(async ({ completed = false } = {}) => {
    setTourActive(false);
    if (completed && vendor && !vendor.tour_completed) {
      try { await updateOnboarding({ tour_completed: true }); } catch (_) { /* non-fatal */ }
    }
  }, [vendor, updateOnboarding]);

  const refreshChecklist = useCallback(() => setChecklistRefreshKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ tourActive, startTour, endTour, checklistRefreshKey, refreshChecklist }),
    [tourActive, startTour, endTour, checklistRefreshKey, refreshChecklist]
  );

  return <OnboardingCtx.Provider value={value}>{children}</OnboardingCtx.Provider>;
};

export const useOnboarding = () => {
  const ctx = useContext(OnboardingCtx);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
};
