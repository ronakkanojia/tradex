import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type CandlePoint = {
  tick: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const INITIAL_CASH = 100000;
const LOT_SIZE = 50;
const RISK_FREE_RATE = 0.065;
const EXPIRY_SECONDS = 60;
const TICK_SECONDS = 2;
const GAME_WEEK_IN_YEARS = 7 / 365;
const MAX_HISTORY_POINTS = 40;

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

function CandlestickChart({ candles }: { candles: CandlePoint[] }) {
  const width = 760;
  const height = 280;
  const padding = { top: 18, right: 20, bottom: 24, left: 54 };
  const values = candles.flatMap((candle) => [candle.high, candle.low]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(max - min, 1);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xFor = (index: number) => padding.left + (index + 0.5) * (plotWidth / Math.max(candles.length, 1));
  const yFor = (price: number) => padding.top + ((max - price) / range) * plotHeight;
  const candleWidth = Math.max(5, Math.min(16, (plotWidth / Math.max(candles.length, 1)) * 0.58));
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const y = padding.top + (index / 4) * plotHeight;
    const price = max - (index / 4) * range;
    return { y, price };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="NIFTY candlestick chart" className="h-full w-full">
      <rect x="0" y="0" width={width} height={height} rx="16" fill="#030712" />
      {gridLines.map((line) => (
        <g key={line.y}>
          <line x1={padding.left} x2={width - padding.right} y1={line.y} y2={line.y} stroke="#1f2937" strokeDasharray="4 5" />
          <text x={padding.left - 8} y={line.y + 4} textAnchor="end" fill="#6b7280" fontSize="11">
            {line.price.toFixed(0)}
          </text>
        </g>
      ))}
      <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#374151" />
      <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#374151" />
      {candles.map((candle, index) => {
        const bullish = candle.close >= candle.open;
        const color = bullish ? '#34d399' : '#f87171';
        const x = xFor(index);
        const openY = yFor(candle.open);
        const closeY = yFor(candle.close);
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(closeY - openY), 2);

        return (
          <g key={candle.tick}>
            <line x1={x} x2={x} y1={yFor(candle.high)} y2={yFor(candle.low)} stroke={color} strokeWidth="2" strokeLinecap="round" />
            <rect
              x={x - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              rx="2"
              fill={bullish ? '#064e3b' : '#7f1d1d'}
              stroke={color}
              strokeWidth="1.5"
            />
          </g>
        );
      })}
      <text x={padding.left} y={height - 6} fill="#6b7280" fontSize="11">Older</text>
      <text x={width - padding.right} y={height - 6} textAnchor="end" fill="#6b7280" fontSize="11">Latest</text>
    </svg>
  );
}

export default function OptionsChain({ niftyData, vixData }: OptionsChainProps) {
  const seedSpot = Number(niftyData.quote?.regularMarketPrice ?? 22000);
  const seedVix = Number(vixData.quote?.regularMarketPrice ?? 15);
  const [spot, setSpot] = useState(seedSpot);
  const [vix, setVix] = useState(seedVix);
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [, setTick] = useState(0);
  const [cash, setCash] = useState(INITIAL_CASH);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<ClosedTrade[]>([]);
  const [candles, setCandles] = useState<CandlePoint[]>([{ tick: 0, open: seedSpot, high: seedSpot, low: seedSpot, close: seedSpot }]);

  const yearsToExpiry = Math.max(secondsLeft / EXPIRY_SECONDS, 0) * GAME_WEEK_IN_YEARS;
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
      setSecondsLeft((value) => Math.max(value - 1, 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSpot((currentSpot) => {
        const dt = TICK_SECONDS / EXPIRY_SECONDS / 52;
        const shock = Math.sqrt(dt) * (Math.random() * 2 - 1);
        const drift = -0.5 * volatility ** 2 * dt;
        const nextSpot = Math.max(1000, currentSpot * Math.exp(drift + volatility * shock));
        setTick((currentTick) => {
          const nextTick = currentTick + 1;
          setCandles((data) => {
            const wickPadding = Math.max(currentSpot * volatility * 0.0006, 3);
            const high = Math.max(currentSpot, nextSpot) + Math.random() * wickPadding;
            const low = Math.min(currentSpot, nextSpot) - Math.random() * wickPadding;
            return [...data, { tick: nextTick, open: currentSpot, high, low, close: nextSpot }].slice(-MAX_HISTORY_POINTS);
          });
          return nextTick;
        });
        return nextSpot;
      });
    }, TICK_SECONDS * 1000);
    return () => window.clearInterval(interval);
  }, [volatility]);

  useEffect(() => {
    if (secondsLeft === 0 && positions.length > 0) {
      positions.forEach((position) => closePosition(position.id, 'Expired'));
    }
  }, [secondsLeft, positions, closePosition]);

  const placeTrade = (strike: number, side: OptionSide, action: TradeAction) => {
    if (secondsLeft === 0) return;
    const entryPrice = getOptionPrice(strike, side);
    const quantity = Math.max(1, Math.floor(orderQuantity));
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
    setCandles([{ tick: 0, open: seedSpot, high: seedSpot, low: seedSpot, close: seedSpot }]);
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
            Reset Game
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
              <p className="text-sm text-gray-400">Expiry countdown</p>
              <p className={`text-3xl font-black ${secondsLeft <= 10 ? 'text-red-400' : 'text-amber-300'}`}>{secondsLeft}s</p>
              <p className="text-xs text-gray-500">60 seconds = 1 in-game week</p>
            </div>
          </div>
          <div className="h-72 rounded-xl bg-gray-950/80 p-3">
            <CandlestickChart candles={candles} />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-xl">
          <p className="text-sm uppercase tracking-widest text-gray-500">Implied Volatility</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-4xl font-black text-red-300">{vix.toFixed(1)}%</p>
            <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">VIX slider</span>
          </div>
          <input
            type="range"
            min="5"
            max="45"
            step="0.5"
            value={vix}
            onChange={(event) => setVix(Number(event.target.value))}
            className="mt-6 w-full accent-red-400"
          />
          <label className="mt-6 block text-sm font-bold text-gray-300" htmlFor="order-quantity">Order quantity (lots)</label>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOrderQuantity((value) => Math.max(1, value - 1))}
              className="rounded-lg bg-gray-800 px-3 py-2 font-black text-gray-100 hover:bg-gray-700"
            >
              −
            </button>
            <input
              id="order-quantity"
              type="number"
              min="1"
              max="50"
              value={orderQuantity}
              onChange={(event) => setOrderQuantity(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
              className="w-28 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-center text-lg font-black text-white outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() => setOrderQuantity((value) => Math.min(50, value + 1))}
              className="rounded-lg bg-gray-800 px-3 py-2 font-black text-gray-100 hover:bg-gray-700"
            >
              +
            </button>
            <span className="text-sm text-gray-500">{orderQuantity * LOT_SIZE} NIFTY units</span>
          </div>
          <div className="mt-6 rounded-xl bg-gray-950 p-4 text-sm text-gray-300">
            <p className="font-bold text-white">Game mechanics</p>
            <p className="mt-2">Spot follows a random GBM-style walk every {TICK_SECONDS}s. Option values decay toward intrinsic value as expiry approaches.</p>
            <p className="mt-2">Each Buy/Sell click trades the selected quantity. Every lot is {LOT_SIZE} NIFTY units, and short options reserve 8% notional margin.</p>
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
