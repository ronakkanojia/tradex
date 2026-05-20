"use client";

import { useMarketData } from '../hooks/useMarketData';
import OptionsChain from '../components/OptionsChain';

export default function Home() {
  const { niftyData, vixData, loading, error } = useMarketData();

  return (
    <main className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight mb-2">
            Nifty Options Trading Simulator
          </h1>
          <p className="text-gray-400">Trade weekly NIFTY options with live Black-Scholes pricing</p>
        </header>

        {loading && !niftyData && (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg text-center mb-8">
            <p className="font-semibold">Error Loading Market Data</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        )}

        {niftyData && vixData && (
          <OptionsChain niftyData={niftyData} vixData={vixData} />
        )}
      </div>
    </main>
  );
}
