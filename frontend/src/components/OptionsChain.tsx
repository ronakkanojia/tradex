import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MarketData } from '../hooks/useMarketData';

interface OptionsChainProps {
  niftyData: MarketData;
  vixData: MarketData;
}

type OptionSide = 'call' | 'put';
type TradeAction = 'BUY' | 'SELL';

type GreekPack = {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
};

type OptionQuote = {
  call: GreekPack;
  put: GreekPack;
};

type Position = {
  id: number;
  side: OptionSide;
  action: TradeAction;
  strike: number;
  quantity: number;
  entryPrice: number;
  openedAt: string;
};

type ClosedTrade = Position & {
  exitPrice: number;
  pnl: number;
  closedAt: string;
  reason: 'Closed' | 'Expired';
};

type ChartPoint = {
  time: string;
  price: number;
};

const INITIAL_CASH = 100000;
const LOT_SIZE = 50;
const RISK_FREE_RATE = 0.065;
const MAX_HISTORY_POINTS = 40;
const EXPIRY_SECONDS = 86400; // 24 hours in seconds

function normalPdf(x: number) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

function normalCdf(x: number) {
  const a1 = 0.31938153;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const p = 0.2316419;
  const k = 1 / (1 + p * Math.abs(x));
  const poly = a1 * k + a2 * k ** 2 + a3 * k ** 3 + a4 * k ** 4 + a5 * k ** 5;
  const approx = 1 - normalPdf(x) * poly;
  return x >= 0 ? approx : 1 - approx;
}

function intrinsicValue(spot: number, strike: number, side: OptionSide) {
  return Math.max(side === 'call' ? spot - strike : strike - spot, 0);
}

function blackScholes(spot: number, strike: number, yearsToExpiry: number, volatility: number, rate: number): OptionQuote {
  if (yearsToExpiry <= 0 || volatility <= 0) {
    return {
      call: { price: intrinsicValue(spot, strike, 'call'), delta: spot > strike ? 1 : 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
      put: { price: intrinsicValue(spot, strike, 'put'), delta: spot < strike ? -1 : 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
    };
  }

  const sqrtT = Math.sqrt(yearsToExpiry);
  const d1 = (Math.log(spot / strike) + (rate + volatility ** 2 / 2) * yearsToExpiry) / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;
  const discount = Math.exp(-rate * yearsToExpiry);
  const callPrice = spot * normalCdf(d1) - strike * discount * normalCdf(d2);
  const putPrice = strike * discount * normalCdf(-d2) - spot * normalCdf(-d1);
  const gamma = normalPdf(d1) / (spot * volatility * sqrtT);
  const vega = (spot * normalPdf(d1) * sqrtT) / 100;
  const callTheta = (-(spot * normalPdf(d1) * volatility) / (2 * sqrtT) - rate * strike * discount * normalCdf(d2)) / 365;
  const putTheta = (-(spot * normalPdf(d1) * volatility) / (2 * sqrtT) + rate * strike * discount * normalCdf(-d2)) / 365;

  return {
    call: {
      price: Math.max(callPrice, 0),
      delta: normalCdf(d1),
      gamma,
      theta: callTheta,
      vega,
      rho: (strike * yearsToExpiry * discount * normalCdf(d2)) / 100,
    },
    put: {
      price: Math.max(putPrice, 0),
      delta: normalCdf(d1) - 1,
      gamma,
      theta: putTheta,
      vega,
      rho: (-strike * yearsToExpiry * discount * normalCdf(-d2)) / 100,
    },
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedCurrency(value: number) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function getNextExpiryDate(): Date {
  const now = new Date();
  const nextThursday = new Date(now);

  // Calculate days to next Thursday (4)
  const day = nextThursday.getUTCDay();
  const daysToThursday = (4 - day + 7) % 7;

  nextThursday.setUTCDate(nextThursday.getUTCDate() + daysToThursday);
  // Set to 10:00 AM UTC (3:30 PM IST)
  nextThursday.setUTCHours(10, 0, 0, 0);

  // If today is Thursday but it's past 10:00 AM UTC, get NEXT Thursday
  if (daysToThursday === 0 && now.getTime() > nextThursday.getTime()) {
    nextThursday.setUTCDate(nextThursday.getUTCDate() + 7);
  }

  return nextThursday;
}

export default function OptionsChain({ niftyData, vixData }: OptionsChainProps) {
  const seedSpot = Number(niftyData.quote?.regularMarketPrice ?? 22000);
  const seedVix = Number(vixData.quote?.regularMarketPrice ?? 15);
  const [spot, setSpot] = useState(seedSpot);
  const [vix, setVix] = useState(seedVix);
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);

  // Real time logic
  const [now, setNow] = useState(new Date());

  const [, setTick] = useState(0);
  const [cash, setCash] = useState(INITIAL_CASH);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<ClosedTrade[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([{ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), price: seedSpot }]);

  const expiryDate = useMemo(() => getNextExpiryDate(), []);
  const millisecondsLeft = Math.max(expiryDate.getTime() - now.getTime(), 0);
  const secondsLeftCalculated = Math.floor(millisecondsLeft / 1000);
  const yearsToExpiry = millisecondsLeft / (1000 * 60 * 60 * 24 * 365);
  const volatility = vix / 100;

  const getOptionPrice = useCallback(
    (strike: number, side: OptionSide) => blackScholes(spot, strike, yearsToExpiry, volatility, RISK_FREE_RATE)[side].price,
    [spot, yearsToExpiry, volatility],
  );

  const strikes = useMemo(() => {
    const atm = Math.round(spot / 50) * 50;
    return Array.from({ length: 11 }, (_, index) => atm + (index - 5) * 50);
  }, [spot]);

  const positionRows = useMemo(() => positions.map((position) => {
    const currentPrice = getOptionPrice(position.strike, position.side);
    const direction = position.action === 'BUY' ? 1 : -1;
    const pnl = (currentPrice - position.entryPrice) * position.quantity * LOT_SIZE * direction;
    return { ...position, currentPrice, pnl };
  }), [positions, getOptionPrice]);

  const unrealisedPnl = positionRows.reduce((sum, position) => sum + position.pnl, 0);
  const marginReserve = positions
    .filter((position) => position.action === 'SELL')
    .reduce((sum, position) => sum + position.strike * position.quantity * LOT_SIZE * 0.08, 0);
  const portfolioValue = cash + unrealisedPnl + marginReserve;
  const totalPnl = portfolioValue - INITIAL_CASH;
  const score = (totalPnl / INITIAL_CASH) * 100;

  const closePosition = useCallback((id: number, reason: ClosedTrade['reason'] = 'Closed') => {
    setPositions((current) => {
      const position = current.find((item) => item.id === id);
      if (!position) return current;

      const exitPrice = reason === 'Expired' ? intrinsicValue(spot, position.strike, position.side) : getOptionPrice(position.strike, position.side);
      const premium = exitPrice * position.quantity * LOT_SIZE;
      const reserve = position.action === 'SELL' ? position.strike * position.quantity * LOT_SIZE * 0.08 : 0;
      const direction = position.action === 'BUY' ? 1 : -1;
      const pnl = (exitPrice - position.entryPrice) * position.quantity * LOT_SIZE * direction;

      setCash((value) => value + (position.action === 'BUY' ? premium : reserve - premium));
      setHistory((trades) => [{ ...position, exitPrice, pnl, closedAt: new Date().toLocaleTimeString(), reason }, ...trades].slice(0, 12));
      return current.filter((item) => item.id !== id);
    });
  }, [getOptionPrice, spot]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (niftyData.quote?.regularMarketPrice) {
      const newSpot = niftyData.quote.regularMarketPrice;
      setSpot(newSpot);
      setChartData((data) => {
        const newData = [...data, { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), price: newSpot }].slice(-MAX_HISTORY_POINTS);
        // Avoid duplicate consecutive entries if the price hasn't changed and it's fetched frequently
        if (data.length > 0 && data[data.length - 1].price === newSpot) {
          return data;
        }
        return newData;
      });
    }
  }, [niftyData]);

  useEffect(() => {
    if (vixData.quote?.regularMarketPrice) {
      setVix(vixData.quote.regularMarketPrice);
    }
  }, [vixData]);

  useEffect(() => {
    if (secondsLeftCalculated === 0 && positions.length > 0) {
      positions.forEach((position) => closePosition(position.id, 'Expired'));
    }
  }, [secondsLeftCalculated, positions, closePosition]);

  const placeTrade = (strike: number, side: OptionSide, action: TradeAction) => {
    if (secondsLeftCalculated === 0) return;
    const entryPrice = getOptionPrice(strike, side);
    const quantity = 1;
    const premium = entryPrice * quantity * LOT_SIZE;
    const reserve = action === 'SELL' ? strike * quantity * LOT_SIZE * 0.08 : 0;
    const requiredCash = action === 'BUY' ? premium : reserve;

    if (cash < requiredCash) return;

    setCash((value) => value - requiredCash + (action === 'SELL' ? premium : 0));
    setPositions((current) => [
      ...current,
      { id: Date.now() + Math.floor(Math.random() * 1000), side, action, strike, quantity, entryPrice, openedAt: new Date().toLocaleTimeString() },
    ]);
  };

  const resetGame = () => {
    setSpot(seedSpot);
    setVix(seedVix);
    setSecondsLeft(EXPIRY_SECONDS);
    setTick(0);
    setCash(INITIAL_CASH);
    setPositions([]);
    setHistory([]);
    setChartData([{ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), price: seedSpot }]);
  };

  return (
    <div className="space-y-6 text-gray-100">
      <section className="rounded-2xl border border-gray-800 bg-gray-900/90 p-5 shadow-2xl">
        <div className="grid gap-4 md:grid-cols-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Virtual Cash</p>
            <p className="text-2xl font-black text-white">{formatCurrency(cash)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Portfolio Value</p>
            <p className="text-2xl font-black text-blue-300">{formatCurrency(portfolioValue)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Total P&amp;L</p>
            <p className={`text-2xl font-black ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSignedCurrency(totalPnl)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Score</p>
            <p className={`text-2xl font-black ${score >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{score.toFixed(2)}%</p>
          </div>
          <button onClick={resetGame} className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 font-bold text-blue-200 transition hover:bg-blue-500/20">
            Reset Portfolio
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-xl">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-widest text-gray-500">NIFTY Spot</p>
              <p className="text-4xl font-black text-white">{spot.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Time to Expiry</p>
              <p className={`text-3xl font-black ${secondsLeftCalculated <= 600 ? 'text-red-400' : 'text-amber-300'}`}>
                {Math.floor(millisecondsLeft / (1000 * 60 * 60 * 24))}d :{' '}
                {Math.floor((millisecondsLeft / (1000 * 60 * 60)) % 24)}h :{' '}
                {Math.floor((millisecondsLeft / 1000 / 60) % 60)}m :{' '}
                {Math.floor((millisecondsLeft / 1000) % 60)}s
              </p>
              <p className="text-xs text-gray-500">{expiryDate.toLocaleString()}</p>
            </div>
          </div>
          <div className="h-72 rounded-xl bg-gray-950/80 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 16, right: 20, bottom: 10, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 12 }} />
                <YAxis domain={['auto', 'auto']} stroke="#6b7280" tickFormatter={(value: number) => value.toFixed(0)} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 12 }}
                  labelStyle={{ color: '#d1d5db' }}
                  formatter={(value: number) => [value.toFixed(2), 'NIFTY']}
                  labelFormatter={(label: string) => `Time: ${label}`}
                />
                <Line dataKey="price" stroke="#60a5fa" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-xl">
          <p className="text-sm uppercase tracking-widest text-gray-500">Implied Volatility (INDIA VIX)</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-4xl font-black text-red-300">{vix.toFixed(1)}%</p>
          </div>
          <div className="mt-6 rounded-xl bg-gray-950 p-4 text-sm text-gray-300">
            <p className="font-bold text-white">Real-Time Tracker</p>
            <p className="mt-2">Spot and VIX are synchronized with live market data. Option values decay dynamically based on real time left until standard expiry.</p>
            <p className="mt-2">Each click trades 1 NIFTY lot ({LOT_SIZE} units). Short options reserve 8% notional margin.</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-xl">
        <div className="border-b border-gray-800 bg-gray-800/80 px-5 py-4">
          <h2 className="text-xl font-black tracking-wide text-white">NIFTY Options Chain</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-center text-sm">
            <thead className="bg-gray-950 text-xs uppercase text-gray-400">
              <tr>
                <th colSpan={8} className="border-r border-gray-800 px-3 py-3 text-blue-300">Calls</th>
                <th className="border-r border-gray-800 px-3 py-3 text-white">Strike</th>
                <th colSpan={8} className="px-3 py-3 text-red-300">Puts</th>
              </tr>
              <tr>
                {['Delta', 'Gamma', 'Theta', 'Vega', 'Rho', 'Theo', 'Buy', 'Sell'].map((label) => <th key={`c-${label}`} className="px-2 py-2">{label}</th>)}
                <th className="border-x border-gray-800 bg-gray-800 px-3 py-2">ATM</th>
                {['Theo', 'Buy', 'Sell', 'Delta', 'Gamma', 'Theta', 'Vega', 'Rho'].map((label) => <th key={`p-${label}`} className="px-2 py-2">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {strikes.map((strike) => {
                const quote = blackScholes(spot, strike, yearsToExpiry, volatility, RISK_FREE_RATE);
                const callItm = spot > strike;
                const putItm = spot < strike;
                return (
                  <tr key={strike} className="border-t border-gray-800 hover:bg-gray-800/70">
                    <td className={callItm ? 'bg-blue-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.call.delta.toFixed(3)}</td>
                    <td className={callItm ? 'bg-blue-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.call.gamma.toFixed(4)}</td>
                    <td className={callItm ? 'bg-blue-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.call.theta.toFixed(2)}</td>
                    <td className={callItm ? 'bg-blue-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.call.vega.toFixed(2)}</td>
                    <td className={callItm ? 'bg-blue-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.call.rho.toFixed(2)}</td>
                    <td className="font-bold text-blue-300">₹{quote.call.price.toFixed(2)}</td>
                    <td><button onClick={() => placeTrade(strike, 'call', 'BUY')} className="rounded bg-blue-500/20 px-3 py-1 font-bold text-blue-200 hover:bg-blue-500/40">Buy</button></td>
                    <td className="border-r border-gray-800"><button onClick={() => placeTrade(strike, 'call', 'SELL')} className="rounded bg-blue-950 px-3 py-1 font-bold text-blue-100 hover:bg-blue-800">Sell</button></td>
                    <td className="border-r border-gray-800 bg-gray-800 px-3 py-3 font-black text-white">{strike}</td>
                    <td className="font-bold text-red-300">₹{quote.put.price.toFixed(2)}</td>
                    <td><button onClick={() => placeTrade(strike, 'put', 'BUY')} className="rounded bg-red-500/20 px-3 py-1 font-bold text-red-200 hover:bg-red-500/40">Buy</button></td>
                    <td><button onClick={() => placeTrade(strike, 'put', 'SELL')} className="rounded bg-red-950 px-3 py-1 font-bold text-red-100 hover:bg-red-800">Sell</button></td>
                    <td className={putItm ? 'bg-red-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.put.delta.toFixed(3)}</td>
                    <td className={putItm ? 'bg-red-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.put.gamma.toFixed(4)}</td>
                    <td className={putItm ? 'bg-red-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.put.theta.toFixed(2)}</td>
                    <td className={putItm ? 'bg-red-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.put.vega.toFixed(2)}</td>
                    <td className={putItm ? 'bg-red-950/40 px-2 py-3' : 'px-2 py-3'}>{quote.put.rho.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-xl">
          <h2 className="mb-4 text-xl font-black text-white">Open Positions</h2>
          <div className="space-y-3">
            {positionRows.length === 0 && <p className="rounded-xl bg-gray-950 p-4 text-gray-500">No open positions yet. Buy or sell from the chain to start the round.</p>}
            {positionRows.map((position) => (
              <div key={position.id} className="grid gap-3 rounded-xl bg-gray-950 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="font-black text-white">{position.action} {position.side.toUpperCase()} {position.strike} × {position.quantity}</p>
                  <p className="text-sm text-gray-400">Entry ₹{position.entryPrice.toFixed(2)} · Current ₹{position.currentPrice.toFixed(2)} · Opened {position.openedAt}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className={`font-black ${position.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSignedCurrency(position.pnl)}</p>
                  <button onClick={() => closePosition(position.id)} className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-bold text-gray-100 hover:bg-gray-700">Close</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-xl">
          <h2 className="mb-4 text-xl font-black text-white">Trade History</h2>
          <div className="space-y-3">
            {history.length === 0 && <p className="rounded-xl bg-gray-950 p-4 text-gray-500">Closed trades and expiry settlements will appear here.</p>}
            {history.map((trade) => (
              <div key={`${trade.id}-${trade.closedAt}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-950 p-4">
                <div>
                  <p className="font-black text-white">{trade.reason}: {trade.action} {trade.side.toUpperCase()} {trade.strike}</p>
                  <p className="text-sm text-gray-400">Entry ₹{trade.entryPrice.toFixed(2)} · Exit ₹{trade.exitPrice.toFixed(2)} · {trade.closedAt}</p>
                </div>
                <p className={`font-black ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSignedCurrency(trade.pnl)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
