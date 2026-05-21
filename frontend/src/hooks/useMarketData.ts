import { useState, useEffect } from 'react';

const API_URL = '/api/market'; // Use local API route

export interface MarketData {
  ticker: string;
  quote: { regularMarketPrice?: number };
  chart: Array<{ timestamp?: number; date?: string; close?: number }> | null;
}

const MOCK_DATA = {
  nifty: { ticker: '^NSEI', quote: { regularMarketPrice: 22000 }, chart: null },
  vix: { ticker: '^INDIAVIX', quote: { regularMarketPrice: 15 }, chart: null },
};

export function useMarketData() {
  const [niftyData, setNiftyData] = useState<MarketData | null>(null);
  const [vixData, setVixData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const [niftyRes, vixRes] = await Promise.all([
          fetch(`${API_URL}?ticker=%5ENSEI&interval=1m`),
          fetch(`${API_URL}?ticker=%5EINDIAVIX&interval=1m`)
        ]);

        if (niftyRes.status === 429 || vixRes.status === 429) {
          setNiftyData(MOCK_DATA.nifty);
          setVixData(MOCK_DATA.vix);
          return;
        }

        if (!niftyRes.ok) throw new Error(`Nifty fetch failed: ${niftyRes.status}`);
        if (!vixRes.ok) throw new Error(`VIX fetch failed: ${vixRes.status}`);

        const nifty = await niftyRes.json();
        const vix = await vixRes.json();

        setNiftyData(nifty);
        setVixData(vix);
      } catch (err: unknown) {
        console.error("Error fetching market data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch market data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const intervalId = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  return { niftyData, vixData, loading, error };
}
