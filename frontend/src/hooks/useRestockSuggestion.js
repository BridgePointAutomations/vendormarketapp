import { useState } from 'react';
import api from '@/lib/api';

const keyFor = (marketId, marketDate) => `${marketId}|${marketDate}`;

/**
 * Shared AI restock-suggestion fetch logic (POST /ai/restock), used by both
 * Allocate.js and AIInsights.js. Results are keyed by (market_id, market_date)
 * so switching context never shows a stale suggestion for a different date.
 */
export function useRestockSuggestion() {
  const [restocks, setRestocks] = useState({}); // `${marketId}|${marketDate}` -> data
  const [loadingKey, setLoadingKey] = useState('');

  const runRestock = async (marketId, marketDate) => {
    const key = keyFor(marketId, marketDate);
    setLoadingKey(key);
    try {
      const { data } = await api.post('/ai/restock', { market_id: marketId, market_date: marketDate });
      setRestocks((prev) => ({ ...prev, [key]: data }));
      return data;
    } finally {
      setLoadingKey('');
    }
  };

  const getRestock = (marketId, marketDate) => restocks[keyFor(marketId, marketDate)];
  const isLoading = (marketId, marketDate) => loadingKey === keyFor(marketId, marketDate);

  return { getRestock, runRestock, isLoading };
}
