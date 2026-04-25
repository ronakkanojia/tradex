/**
 * Standard Normal Cumulative Distribution Function
 */
function CND(x) {
  const a1 = 0.31938153;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0.0) {
    const l = Math.abs(x);
    const k = 1.0 / (1.0 + p * l);
    const w = 1.0 - c * Math.exp(-l * l / 2.0) * (a1 * k + a2 * k * k + a3 * Math.pow(k, 3) + a4 * Math.pow(k, 4) + a5 * Math.pow(k, 5));
    return w;
  } else {
    const l = Math.abs(x);
    const k = 1.0 / (1.0 + p * l);
    const w = c * Math.exp(-l * l / 2.0) * (a1 * k + a2 * k * k + a3 * Math.pow(k, 3) + a4 * Math.pow(k, 4) + a5 * Math.pow(k, 5));
    return w;
  }
}

/**
 * Standard Normal Probability Density Function
 */
function ND(x) {
  return (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Calculate Black-Scholes theoretical price and Greeks
 * @param {number} S - Underlying Price
 * @param {number} K - Strike Price
 * @param {number} T - Time to Expiry (in years)
 * @param {number} v - Volatility (decimal)
 * @param {number} r - Risk-Free Rate (decimal)
 */
export function blackScholes(S, K, T, v, r) {
  // Edge case for near expiry
  if (T <= 0) {
    return {
      call: { price: Math.max(0, S - K), delta: S > K ? 1 : 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
      put: { price: Math.max(0, K - S), delta: S < K ? -1 : 0, gamma: 0, theta: 0, vega: 0, rho: 0 }
    };
  }

  const d1 = (Math.log(S / K) + (r + v * v / 2.0) * T) / (v * Math.sqrt(T));
  const d2 = d1 - v * Math.sqrt(T);

  const CNDd1 = CND(d1);
  const CNDd2 = CND(d2);
  const CNDMinusd1 = CND(-d1);
  const CNDMinusd2 = CND(-d2);
  const NDd1 = ND(d1);

  // Prices
  const callPrice = S * CNDd1 - K * Math.exp(-r * T) * CNDd2;
  const putPrice = K * Math.exp(-r * T) * CNDMinusd2 - S * CNDMinusd1;

  // Greeks
  const gamma = NDd1 / (S * v * Math.sqrt(T));
  const vega = S * NDd1 * Math.sqrt(T) / 100; // Divided by 100 to show per 1% change

  const callDelta = CNDd1;
  const putDelta = CNDd1 - 1;

  const callTheta = (- (S * v * NDd1) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * CNDd2) / 365;
  const putTheta = (- (S * v * NDd1) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * CNDMinusd2) / 365;

  const callRho = (K * T * Math.exp(-r * T) * CNDd2) / 100;
  const putRho = (-K * T * Math.exp(-r * T) * CNDMinusd2) / 100;

  return {
    call: { price: callPrice, delta: callDelta, gamma, theta: callTheta, vega, rho: callRho },
    put: { price: putPrice, delta: putDelta, gamma, theta: putTheta, vega, rho: putRho }
  };
}
