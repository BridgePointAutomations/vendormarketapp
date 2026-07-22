import { useState } from 'react';
import api from '@/lib/api';

/**
 * Shared AI market-fit evaluation logic (POST /ai/market-fit), used by both
 * Markets.js (candidate list) and AIInsights.js (fit evaluations section).
 */
export function useMarketFit() {
  const [fits, setFits] = useState({}); // market_id -> data | { error }
  const [busyId, setBusyId] = useState('');

  const runFit = async (marketId) => {
    setBusyId(marketId);
    try {
      const { data } = await api.post('/ai/market-fit', { market_id: marketId });
      setFits((prev) => ({ ...prev, [marketId]: data }));
    } catch (e) {
      setFits((prev) => ({ ...prev, [marketId]: { error: e?.response?.data?.detail || 'AI request failed' } }));
    } finally {
      setBusyId('');
    }
  };

  return { fits, busyId, runFit };
}
