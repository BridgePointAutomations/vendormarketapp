export const isLowStock = (p) => (p?.current_stock || 0) <= (p?.low_stock_threshold || 0);
