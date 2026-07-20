export const fmtCurrency = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '$0';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

export const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
};

export const fmtDateShort = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return iso; }
};

export const daysUntil = (iso) => {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  const diff = Math.round((d - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return diff;
};

export const toIsoDate = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d.length > 10 ? d.slice(0, 10) : d;
  const dt = new Date(d);
  const yr = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${day}`;
};

export const todayIso = () => toIsoDate(new Date());
