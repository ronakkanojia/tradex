import { useState, useEffect } from 'react';

// In production, this should be the deployed Firebase Function URL.
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export interface MarketData {
  ticker: string;
  quote: any;
  chart: any[] | null;
}

const MOCK_NIFTY_DATA: MarketData = {
  ticker: '^NSEI',
  quote: { regularMarketPrice: 22000 },
  chart: null,
};

const MOCK_VIX_DATA: MarketData = {
  ticker: '^INDIAVIX',
  quote: { regularMarketPrice: 15 },
  chart: null,
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
        if (!API_URL) {
          throw new Error('NEXT_PUBLIC_API_URL is not configured');
        }

        const [niftyRes, vixRes] = await Promise.all([
          fetch(`${API_URL}?ticker=%5ENSEI&interval=1m`),
          fetch(`${API_URL}?ticker=%5EINDIAVIX&interval=1m`)
        ]);

        if (niftyRes.status === 429 || vixRes.status === 429) {
            // Mock data because yahoo-finance2 is rate limited
            setNiftyData(MOCK_NIFTY_DATA);
            setVixData(MOCK_VIX_DATA);
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
        // Fall back to mock data so the UI can still render when API is unreachable.
        setNiftyData(MOCK_NIFTY_DATA);
        setVixData(MOCK_VIX_DATA);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Auto refresh every 1 minute
    const intervalId = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  return { niftyData, vixData, loading, error };
}
