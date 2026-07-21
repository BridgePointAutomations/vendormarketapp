import api from '@/lib/api';

/**
 * Download a CSV response from a backend endpoint that returns a text/csv blob.
 * Uses the app's authenticated axios client so the JWT header is included.
 *
 * @param {string} url - API path (e.g. `/pnl/season/abc/export`)
 * @param {string} filename - fallback filename if the server doesn't return Content-Disposition
 * @param {object} [params] - optional query params
 */
export async function downloadCsv(url, filename, params) {
  const res = await api.get(url, { params, responseType: 'blob' });
  // Prefer the server-provided filename from Content-Disposition
  const disp = res.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(disp);
  const finalName = match ? match[1] : filename;

  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
  const objUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(objUrl);
}
