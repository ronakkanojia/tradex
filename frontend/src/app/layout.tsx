import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tradex Market Data",
  description: "Serverless Option Pricing & Simulation Engine",
  title: "Nifty Options Trading Simulator",
  description: "A virtual NIFTY options simulator with Black-Scholes pricing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
