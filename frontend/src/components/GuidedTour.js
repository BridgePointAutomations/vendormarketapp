import { useEffect, useState, useLayoutEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useOnboarding } from '@/context/OnboardingContext';

/**
 * GuidedTour — lightweight, vanilla-React spotlight overlay.
 *  - Reads tourActive from OnboardingContext.
 *  - Cycles through TOUR_STEPS, spotlighting the target element by data-testid.
 *  - Persists tour_completed via endTour({completed:true}) when finished.
 */

const TOUR_STEPS = [
  {
    id: 'markets',
    testid: 'nav-markets',
    title: 'Manage your markets',
    body: "Each market you sell at lives here — add schedules, permits, and season windows.",
  },
  {
    id: 'products',
    testid: 'nav-products',
    title: 'Track what’s on the shelf',
    body: 'Products, prices, and stock levels. Low-stock warnings tie back to allocations.',
  },
  {
    id: 'allocate',
    testid: 'nav-allocate',
    title: 'Allocate for market day',
    body: 'Assign product quantities to a specific market date and record what actually sold.',
  },
  {
    id: 'compliance',
    testid: 'nav-compliance',
    title: 'Never miss a permit',
    body: 'Track licenses, insurance, and permits. Expiring items surface on the Dashboard.',
  },
  {
    id: 'ai',
    testid: 'nav-ai',
    title: 'AI helper (paid tier)',
    body: 'Restock hints, market-fit reviews, and revenue projections. Toggle tier in Settings.',
  },
];

const PADDING = 8;
const TOOLTIP_W = 320;
const TOOLTIP_GAP = 14;

// Find the first matching element that is actually visible (non-zero size).
// The nav item a tour step targets may exist twice in the DOM — once in the
// desktop sidebar, once in the mobile tab bar / "More" sheet — with only one
// visible at a given viewport width via CSS.
function resolveVisibleTarget(testid) {
  const el = document.querySelector(`[data-testid="${testid}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

export default function GuidedTour() {
  const { tourActive, endTour } = useOnboarding();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, placement: 'right' });
  const [missingTarget, setMissingTarget] = useState(false);
  const [tooltipWidth, setTooltipWidth] = useState(TOOLTIP_W);

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const measure = useCallback(() => {
    if (!step) return;
    const el = resolveVisibleTarget(`tab-${step.testid}`) || resolveVisibleTarget(step.testid);
    if (!el) {
      setMissingTarget(true);
      setRect(null);
      return;
    }
    setMissingTarget(false);
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    });

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = Math.min(TOOLTIP_W, vw - 32);
    setTooltipWidth(tw);

    // Prefer right placement; fall back to below/above if we're near the viewport edge.
    const rightSpace = vw - (r.right + TOOLTIP_GAP);
    let placement = 'right';
    let top = r.top;
    let left = Math.max(16, Math.min(r.right + TOOLTIP_GAP, vw - tw - 16));
    if (rightSpace < tw + 20) {
      // place below the element
      placement = 'below';
      top = r.bottom + TOOLTIP_GAP;
      left = Math.max(16, Math.min(r.left, vw - tw - 16));
      if (top + 200 > vh) {
        placement = 'above';
        top = Math.max(16, r.top - 200 - TOOLTIP_GAP);
      }
    }
    setTooltipPos({ top, left, placement });
  }, [step]);

  useLayoutEffect(() => {
    if (!tourActive) return;
    measure();
  }, [tourActive, measure]);

  useEffect(() => {
    if (!tourActive) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    // Retry a few times in case the target isn’t mounted yet.
    const retries = [50, 150, 400].map((ms) => setTimeout(measure, ms));
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      retries.forEach(clearTimeout);
    };
  }, [tourActive, stepIndex, measure]);

  useEffect(() => {
    if (!tourActive) return;
    const onKey = (e) => {
      if (e.key === 'Escape') endTour({ completed: false });
      if (e.key === 'ArrowRight') {
        if (isLast) endTour({ completed: true });
        else setStepIndex((i) => i + 1);
      }
      if (e.key === 'ArrowLeft') {
        setStepIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourActive, isLast, endTour]);

  // Reset step when tour opens
  useEffect(() => {
    if (tourActive) setStepIndex(0);
  }, [tourActive]);

  if (!tourActive) return null;

  const handleNext = () => {
    if (isLast) endTour({ completed: true });
    else setStepIndex((i) => i + 1);
  };
  const handleBack = () => setStepIndex((i) => Math.max(0, i - 1));
  const handleSkip = () => endTour({ completed: false });
  const handleFinish = () => endTour({ completed: true });

  return (
    <div
      data-testid="guided-tour"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        pointerEvents: 'none',
      }}
      aria-live="polite"
    >
      {/* Dark backdrop with spotlight cutout */}
      {rect ? (
        <div
          onClick={handleSkip}
          style={{
            position: 'fixed',
            top: rect.top, left: rect.left,
            width: rect.width, height: rect.height,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(30, 26, 20, 0.68)',
            outline: '2px dashed rgba(255, 245, 230, 0.75)',
            outlineOffset: 2,
            transition: 'top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease',
            pointerEvents: 'auto',
          }}
        />
      ) : (
        <div
          onClick={handleSkip}
          style={{ position: 'fixed', inset: 0, background: 'rgba(30, 26, 20, 0.68)', pointerEvents: 'auto' }}
        />
      )}

      {/* Tooltip card */}
      <div
        data-testid="guided-tour-tooltip"
        style={{
          position: 'fixed',
          top: tooltipPos.top, left: tooltipPos.left,
          width: tooltipWidth,
          background: 'var(--canvas)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 18,
          boxShadow: '0 12px 32px rgba(30, 26, 20, 0.25)',
          pointerEvents: 'auto',
          transition: 'top 200ms ease, left 200ms ease',
        }}
      >
        <button
          onClick={handleSkip}
          aria-label="Skip tour"
          data-testid="guided-tour-skip"
          className="btn ghost tiny"
          style={{ position: 'absolute', top: 8, right: 8, padding: 4 }}
        >
          <X size={14} />
        </button>

        <div className="display-xs text-muted" style={{ marginBottom: 6 }}>
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </div>
        <div className="display-md" style={{ marginBottom: 6, paddingRight: 20 }}>{step.title}</div>
        <p style={{ fontSize: 13.5, color: 'var(--charcoal-soft)', marginBottom: 14, lineHeight: 1.5 }}>
          {missingTarget ? "This step's element isn't visible on the current page — tap Next to continue." : step.body}
        </p>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {TOUR_STEPS.map((s, i) => (
            <div
              key={s.id}
              style={{
                width: i === stepIndex ? 18 : 8, height: 6, borderRadius: 3,
                background: i <= stepIndex ? 'var(--stamp-red)' : 'var(--line)',
                transition: 'width 150ms ease, background 150ms ease',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleBack}
            disabled={stepIndex === 0}
            className="btn ghost tiny"
            data-testid="guided-tour-back"
          >
            <ChevronLeft size={12} /> Back
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSkip}
              className="btn ghost tiny"
              data-testid="guided-tour-skip-btn"
            >
              Skip
            </button>
            {isLast ? (
              <button
                onClick={handleFinish}
                className="btn primary tiny"
                data-testid="guided-tour-finish"
              >
                <Check size={12} /> Finish
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="btn primary tiny"
                data-testid="guided-tour-next"
              >
                Next <ChevronRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
