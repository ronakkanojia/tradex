import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const interval = searchParams.get('interval') || '1m';
  const range = searchParams.get('range') || '1d';

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
  }

  try {
    const [quote, chartResult] = await Promise.all([
      yahooFinance.quote(ticker),
      yahooFinance.chart(ticker, { interval: interval as any, period1: new Date(Date.now() - 24 * 60 * 60 * 1000) }),
    ]);

    return NextResponse.json({
      ticker,
      quote,
      chart: chartResult.quotes,
    });
  } catch (error) {
    console.error('Yahoo Finance API Error:', error);

    // Check for rate limit error
    if (error instanceof Error && error.message.includes('Too Many Requests')) {
       return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
