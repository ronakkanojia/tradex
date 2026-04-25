import React, { useMemo } from 'react';
import { blackScholes } from '../utils/blackScholes';
import { MarketData } from '../hooks/useMarketData';

interface OptionsChainProps {
  niftyData: MarketData;
  vixData: MarketData;
}

const RISK_FREE_RATE = 0.065;
const DAYS_TO_EXPIRY = 7; // Hardcoded to 1 week for demo purposes
const TIME_TO_EXPIRY = DAYS_TO_EXPIRY / 365.0;

export default function OptionsChain({ niftyData, vixData }: OptionsChainProps) {
  const currentNiftyPrice = niftyData.quote?.regularMarketPrice;
  const currentVix = vixData.quote?.regularMarketPrice;

  const strikes = useMemo(() => {
    if (!currentNiftyPrice) return [];

    // Nifty strike intervals are typically 50
    const roundedStrike = Math.round(currentNiftyPrice / 50) * 50;

    // 5 ITM, 1 ATM, 5 OTM (11 strikes total for better symmetry)
    const generatedStrikes = [];
    for (let i = -5; i <= 5; i++) {
      generatedStrikes.push(roundedStrike + (i * 50));
    }
    return generatedStrikes;
  }, [currentNiftyPrice]);

  if (!currentNiftyPrice || !currentVix) {
    return <div className="text-center p-4">Waiting for market data...</div>;
  }

  const volatility = currentVix / 100.0;

  return (
    <div className="w-full max-w-6xl mx-auto mt-8 bg-gray-900 rounded-xl shadow-2xl overflow-hidden text-gray-200">
      <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-800">
        <h2 className="text-xl font-bold text-white tracking-wider">NIFTY OPTIONS CHAIN</h2>
        <div className="flex gap-4 text-sm font-medium">
          <div className="bg-gray-700 px-3 py-1 rounded-md">
            Underlying: <span className="text-blue-400 font-bold">{currentNiftyPrice.toFixed(2)}</span>
          </div>
          <div className="bg-gray-700 px-3 py-1 rounded-md">
            Volatility (VIX): <span className="text-red-400 font-bold">{currentVix.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-center">
          <thead className="text-xs uppercase bg-gray-800 text-gray-400">
            <tr>
              <th colSpan={6} className="px-4 py-3 border-r border-gray-700">CALLS</th>
              <th className="px-4 py-3 border-r border-gray-700 bg-gray-700 text-white">STRIKE</th>
              <th colSpan={6} className="px-4 py-3">PUTS</th>
            </tr>
            <tr className="border-b border-gray-700 bg-gray-800">
              <th className="px-2 py-2">Delta</th>
              <th className="px-2 py-2">Gamma</th>
              <th className="px-2 py-2">Theta</th>
              <th className="px-2 py-2">Vega</th>
              <th className="px-2 py-2">Rho</th>
              <th className="px-4 py-2 border-r border-gray-700 text-blue-400 font-bold">Theo Price</th>

              <th className="px-4 py-2 border-r border-gray-700 bg-gray-700"></th>

              <th className="px-4 py-2 text-red-400 font-bold">Theo Price</th>
              <th className="px-2 py-2">Delta</th>
              <th className="px-2 py-2">Gamma</th>
              <th className="px-2 py-2">Theta</th>
              <th className="px-2 py-2">Vega</th>
              <th className="px-2 py-2">Rho</th>
            </tr>
          </thead>
          <tbody>
            {strikes.map((strike) => {
              const { call, put } = blackScholes(currentNiftyPrice, strike, TIME_TO_EXPIRY, volatility, RISK_FREE_RATE);
              const isCallITM = currentNiftyPrice > strike;
              const isPutITM = currentNiftyPrice < strike;

              return (
                <tr key={strike} className={`border-b border-gray-800 hover:bg-gray-700 transition-colors`}>
                  {/* CALLS */}
                  <td className={`px-2 py-2 ${isCallITM ? 'bg-blue-900/20' : ''}`}>{call.delta.toFixed(4)}</td>
                  <td className={`px-2 py-2 ${isCallITM ? 'bg-blue-900/20' : ''}`}>{call.gamma.toFixed(4)}</td>
                  <td className={`px-2 py-2 ${isCallITM ? 'bg-blue-900/20' : ''}`}>{call.theta.toFixed(4)}</td>
                  <td className={`px-2 py-2 ${isCallITM ? 'bg-blue-900/20' : ''}`}>{call.vega.toFixed(4)}</td>
                  <td className={`px-2 py-2 ${isCallITM ? 'bg-blue-900/20' : ''}`}>{call.rho.toFixed(4)}</td>
                  <td className={`px-4 py-2 border-r border-gray-700 font-bold text-blue-400 ${isCallITM ? 'bg-blue-900/30' : ''}`}>
                    {call.price.toFixed(2)}
                  </td>

                  {/* STRIKE */}
                  <td className="px-4 py-2 border-r border-gray-700 bg-gray-800 font-bold text-white">
                    {strike}
                  </td>

                  {/* PUTS */}
                  <td className={`px-4 py-2 font-bold text-red-400 ${isPutITM ? 'bg-red-900/30' : ''}`}>
                    {put.price.toFixed(2)}
                  </td>
                  <td className={`px-2 py-2 ${isPutITM ? 'bg-red-900/20' : ''}`}>{put.delta.toFixed(4)}</td>
                  <td className={`px-2 py-2 ${isPutITM ? 'bg-red-900/20' : ''}`}>{put.gamma.toFixed(4)}</td>
                  <td className={`px-2 py-2 ${isPutITM ? 'bg-red-900/20' : ''}`}>{put.theta.toFixed(4)}</td>
                  <td className={`px-2 py-2 ${isPutITM ? 'bg-red-900/20' : ''}`}>{put.vega.toFixed(4)}</td>
                  <td className={`px-2 py-2 ${isPutITM ? 'bg-red-900/20' : ''}`}>{put.rho.toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
