import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { SectionHead, Empty, Modal } from '@/components/ui-market';
import { fmtCurrency } from '@/lib/format';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const empty = { name: '', sku: '', unit: 'piece', unit_price: 0, current_stock: 0, low_stock_threshold: 0 };

export default function Products() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/products');
      setItems(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...modal.form,
        unit_price: Number(modal.form.unit_price) || 0,
        current_stock: Number(modal.form.current_stock) || 0,
        low_stock_threshold: Number(modal.form.low_stock_threshold) || 0,
      };
      if (modal.id) await api.patch(`/products/${modal.id}`, payload);
      else await api.post('/products', payload);
      setModal(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const del = async (p) => {
    if (!confirm(`Remove ${p.name}? Related allocations will be removed.`)) return;
    await api.delete(`/products/${p.id}`);
    load();
  };

  const lowStock = (p) => (p.current_stock || 0) <= (p.low_stock_threshold || 0);

  return (
    <div>
      <SectionHead title="Products">
        <button className="btn primary tiny" onClick={() => setModal({ form: { ...empty } })} data-testid="add-product-btn"><Plus size={13} /> Add product</button>
      </SectionHead>
      <p style={{ color: 'var(--charcoal-soft)', marginBottom: 24, fontSize: 14 }}>Your master inventory list — what you make, sell, and stock.</p>

      {loading && <div className="empty">Loading…</div>}
      {!loading && items.length === 0 && <Empty title="No products yet">Add products to start allocating them across markets.</Empty>}

      {!loading && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }} data-testid="products-grid">
          {items.map(p => (
            <div key={p.id} className={`produce-tag ${lowStock(p) ? 'low' : 'ok'}`} data-testid={`product-tag-${p.id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div className="display-xs text-muted">{p.sku || '—'} · {p.unit || 'piece'}</div>
                  <div className="display-sm" style={{ fontSize: 16, marginTop: 2, letterSpacing: '0.02em' }}>{p.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="number" style={{ fontSize: 30, lineHeight: 1 }}>{p.current_stock}</div>
                  <div style={{ fontSize: 11, color: 'var(--charcoal-soft)' }}>in stock</div>
                </div>
              </div>
              <hr className="dashed-hr" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span>{fmtCurrency(p.unit_price)}</span>
                <span style={{ color: lowStock(p) ? 'var(--stamp-red)' : 'var(--charcoal-soft)' }}>
                  {lowStock(p) ? `Below ${p.low_stock_threshold}` : `Threshold: ${p.low_stock_threshold}`}
                </span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn ghost tiny" onClick={() => setModal({ id: p.id, form: { ...p } })}><Pencil size={11} /></button>
                <button className="btn ghost tiny" onClick={() => del(p)}><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit product' : 'Add product'} testId="product-modal">
        {modal && (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field"><label>Name</label><input required value={modal.form.name} onChange={e => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })} data-testid="product-name-input" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>SKU</label><input value={modal.form.sku || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, sku: e.target.value } })} /></div>
              <div className="field"><label>Unit</label><input value={modal.form.unit || ''} onChange={e => setModal({ ...modal, form: { ...modal.form, unit: e.target.value } })} placeholder="loaf, jar, piece…" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="field"><label>Unit price ($)</label><input type="number" min="0" step="0.01" value={modal.form.unit_price} onChange={e => setModal({ ...modal, form: { ...modal.form, unit_price: e.target.value } })} data-testid="product-price-input" /></div>
              <div className="field"><label>Current stock</label><input type="number" min="0" value={modal.form.current_stock} onChange={e => setModal({ ...modal, form: { ...modal.form, current_stock: e.target.value } })} data-testid="product-stock-input" /></div>
              <div className="field"><label>Low threshold</label><input type="number" min="0" value={modal.form.low_stock_threshold} onChange={e => setModal({ ...modal, form: { ...modal.form, low_stock_threshold: e.target.value } })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn outline" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn primary" disabled={saving} data-testid="product-save">{saving ? '…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
