import * as React from 'react';

type DataPoint = Record<string, string | number>;
type CommonProps = { children?: React.ReactNode; className?: string };

export function ResponsiveContainer(props: CommonProps & { width?: string | number; height?: string | number }): React.ReactElement;
export function LineChart(props: CommonProps & { data?: DataPoint[]; margin?: { top?: number; right?: number; bottom?: number; left?: number } }): React.ReactElement;
export function Line(props: { dataKey?: string; stroke?: string; strokeWidth?: number; dot?: boolean }): React.ReactElement | null;
export function XAxis(props: { dataKey?: string; stroke?: string; hide?: boolean }): React.ReactElement | null;
export function YAxis(props: { domain?: Array<string | number>; stroke?: string; width?: number; tickFormatter?: (value: number) => string }): React.ReactElement | null;
export function Tooltip(props: { contentStyle?: React.CSSProperties; labelStyle?: React.CSSProperties; formatter?: (value: number) => [string, string]; labelFormatter?: (label: string) => string }): React.ReactElement | null;
export function CartesianGrid(props: { strokeDasharray?: string; stroke?: string }): React.ReactElement | null;
