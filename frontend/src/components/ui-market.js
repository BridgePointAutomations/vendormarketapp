export const StatBlock = ({ label, value, hint, testId }) => (
  <div className="stat-block" data-testid={testId}>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    {hint && <div className="stat-hint">{hint}</div>}
  </div>
);

export const StampBadge = ({ variant = 'ready', children, testId }) => (
  <span className={`stamp-badge ${variant}`} data-testid={testId}>{children}</span>
);

export const StatusPill = ({ variant = 'active', children, testId }) => (
  <span className={`status-pill ${variant}`} data-testid={testId}>{children}</span>
);

export const AINote = ({ children, label = 'AI SUGGESTION', testId }) => (
  <div className="ai-note-block" data-testid={testId}>
    <div className="ai-note">{children}</div>
  </div>
);

export const SectionHead = ({ title, children }) => (
  <div className="section-head">
    <h2 className="display">{title}</h2>
    <div style={{ display: 'flex', gap: 8 }}>{children}</div>
  </div>
);

export const Empty = ({ title, children, testId }) => (
  <div className="empty" data-testid={testId}>
    <div className="display-sm" style={{ marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 14 }}>{children}</div>
  </div>
);

export const Modal = ({ open, onClose, title, children, testId }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid={testId}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, marginTop: 4 }}>
          <h3 className="display-md">{title}</h3>
          <button onClick={onClose} className="btn ghost tiny" data-testid={`${testId}-close`}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
};
