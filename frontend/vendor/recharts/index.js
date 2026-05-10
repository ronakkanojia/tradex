import React, { createContext, useContext } from 'react';

const ChartContext = createContext(null);

export function ResponsiveContainer({ width = '100%', height = 300, children, className }) {
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };
  return React.createElement('div', { className, style }, children);
}

export function LineChart({ data = [], children, margin = {}, className }) {
  const width = 760;
  const height = 280;
  const pad = {
    top: margin.top ?? 20,
    right: margin.right ?? 24,
    bottom: margin.bottom ?? 24,
    left: margin.left ?? 38,
  };
  const values = data.map((d) => Number(d.price)).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(max - min, 1);
  const x = (index) => pad.left + (index / Math.max(data.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + ((max - value) / range) * (height - pad.top - pad.bottom);
  const ctx = { data, width, height, pad, min, max, x, y };
  return React.createElement(
    ChartContext.Provider,
    { value: ctx },
    React.createElement('svg', { viewBox: `0 0 ${width} ${height}`, className, role: 'img', style: { width: '100%', height: '100%', display: 'block' } }, children),
  );
}

export function CartesianGrid({ stroke = '#374151', strokeDasharray = '3 3' }) {
  const ctx = useContext(ChartContext);
  if (!ctx) return null;
  const lines = [];
  for (let i = 0; i <= 4; i += 1) {
    const y = ctx.pad.top + (i / 4) * (ctx.height - ctx.pad.top - ctx.pad.bottom);
    lines.push(React.createElement('line', { key: `h${i}`, x1: ctx.pad.left, y1: y, x2: ctx.width - ctx.pad.right, y2: y, stroke, strokeDasharray }));
  }
  return React.createElement('g', null, lines);
}

export function XAxis({ stroke = '#9ca3af' }) {
  const ctx = useContext(ChartContext);
  if (!ctx) return null;
  const y = ctx.height - ctx.pad.bottom;
  return React.createElement('line', { x1: ctx.pad.left, y1: y, x2: ctx.width - ctx.pad.right, y2: y, stroke });
}

export function YAxis({ stroke = '#9ca3af' }) {
  const ctx = useContext(ChartContext);
  if (!ctx) return null;
  return React.createElement('line', { x1: ctx.pad.left, y1: ctx.pad.top, x2: ctx.pad.left, y2: ctx.height - ctx.pad.bottom, stroke });
}

export function Tooltip() { return null; }

export function Line({ dataKey = 'price', stroke = '#60a5fa', strokeWidth = 2, dot = false }) {
  const ctx = useContext(ChartContext);
  if (!ctx || !ctx.data.length) return null;
  const points = ctx.data
    .map((d, index) => `${ctx.x(index)},${ctx.y(Number(d[dataKey]))}`)
    .join(' ');
  const dots = dot ? ctx.data.map((d, index) => React.createElement('circle', { key: index, cx: ctx.x(index), cy: ctx.y(Number(d[dataKey])), r: 2, fill: stroke })) : null;
  return React.createElement('g', null, React.createElement('polyline', { points, fill: 'none', stroke, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' }), dots);
}
