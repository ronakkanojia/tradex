import { useState, useEffect } from 'react';

// Assuming Cloud Function running locally at first, or fallback.
// In production, this would be the deployed Firebase Function URL.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5001/';

export interface MarketData {
  ticker: string;
  quote: any;
  chart: any[] | null;
}

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
            // Mock data because yahoo-finance2 is rate limited
            setNiftyData({
                ticker: '^NSEI',
                quote: { regularMarketPrice: 22000 },
                chart: null
            });
            setVixData({
                ticker: '^INDIAVIX',
                quote: { regularMarketPrice: 15 },
                chart: null
            });
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

    // Auto refresh every 1 minute
    const intervalId = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  return { niftyData, vixData, loading, error };
}
