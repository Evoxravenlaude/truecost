/* Markets TrueCost covers, and the per-market assumptions the venues' APIs don't give us.
   dailyVol and halfSpreadBps feed the slippage estimate; review them every few weeks. */
module.exports = [
  { sym: 'BTC', name: 'Bitcoin', hl: 'BTC', lt: 'BTC', dailyVol: 0.025, halfSpreadBps: 0.2 },
  { sym: 'ETH', name: 'Ether', hl: 'ETH', lt: 'ETH', dailyVol: 0.03, halfSpreadBps: 0.3 },
  { sym: 'SOL', name: 'Solana', hl: 'SOL', lt: 'SOL', dailyVol: 0.04, halfSpreadBps: 0.5 },
  { sym: 'HYPE', name: 'Hyperliquid token', hl: 'HYPE', lt: 'HYPE', dailyVol: 0.05, halfSpreadBps: 0.5 },
  { sym: 'XRP', name: 'XRP', hl: 'XRP', lt: 'XRP', dailyVol: 0.04, halfSpreadBps: 0.8 },
  { sym: 'DOGE', name: 'Dogecoin', hl: 'DOGE', lt: 'DOGE', dailyVol: 0.045, halfSpreadBps: 1 },
  { sym: 'ENA', name: 'Ethena', hl: 'ENA', lt: 'ENA', dailyVol: 0.06, halfSpreadBps: 2 },
  { sym: 'WIF', name: 'dogwifhat', hl: 'WIF', lt: 'WIF', dailyVol: 0.06, halfSpreadBps: 2 },
  // Hyperliquid lists "kPEPE", Lighter lists "1000PEPE": same contract size, different ticker.
  { sym: 'kPEPE', name: 'Pepe (x1000)', hl: 'kPEPE', lt: '1000PEPE', dailyVol: 0.06, halfSpreadBps: 2 },
  { sym: 'FARTCOIN', name: 'Fartcoin', hl: 'FARTCOIN', lt: 'FARTCOIN', dailyVol: 0.07, halfSpreadBps: 2 },
  { sym: 'PUMP', name: 'Pump.fun', hl: 'PUMP', lt: 'PUMP', dailyVol: 0.07, halfSpreadBps: 2 }
];
