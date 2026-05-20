const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const yahooFinance = require('yahoo-finance2').default;

exports.getMarketData = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const ticker = req.query.ticker;
    const interval = req.query.interval || "1m";

    if (!ticker) {
        return res.status(400).json({ error: "Missing ticker parameter" });
    }

    try {
      logger.info(`Fetching data for ${ticker} with interval ${interval}`);

      const quote = await yahooFinance.quote(ticker);

      // Attempt to fetch chart data
      let chart = null;
      try {
        const period1 = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
        chart = await yahooFinance.chart(ticker, { period1, interval });
      } catch (chartErr) {
         logger.warn(`Could not fetch chart for ${ticker}: ${chartErr.message}`);
         // If "Too Many Requests" or invalid JSON, capture it
         if (chartErr.message && chartErr.message.includes("invalid json") && chartErr.message.includes("Too Many Requests")) {
            return res.status(429).json({ error: "Rate limit exceeded" });
         }
      }

      res.status(200).json({
          ticker,
          quote,
          chart: chart ? chart.quotes : null
      });

    } catch (error) {
      logger.error(`Error fetching data for ${ticker}:`, error);
      if (error.message && error.message.includes("invalid json") && error.message.includes("Too Many Requests")) {
         return res.status(429).json({ error: "Rate limit exceeded" });
      }
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });
});
