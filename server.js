const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Trading durumu
let tradingState = {
  portfolio: {
    usd: 10000,
    initialBalance: 10000,
    positions: []
  },
  trades: [],
  priceHistory: {},
  performanceHistory: [],
  startTime: new Date().toISOString()
};

// Trading stratejisi
const shouldTrade = () => {
  // Her kontrol ettiğimizde %80 ihtimalle trade yapacak
  console.log("Trade kontrolü yapılıyor..."); // Debug log
  return Math.random() < 0.8;
};

// Trade parametreleri 
const generateTradeParams = () => {
  return {
    type: Math.random() > 0.5 ? 'LONG' : 'SHORT',
    leverage: Math.floor(Math.random() * 10) + 1, // 1-10x kaldıraç
    targetProfit: Math.random() * 20, // 0-20% kar hedefi
    targetLoss: -Math.random() * 20, // 0-20% zarar kesme
    portfolioPercentage: 0.2 + Math.random() * 0.3 // Portföyün %20-50'si
  };
};

// Pozisyon aç
const openPosition = async (prices) => {
  if (!shouldTrade()) return;

  const coins = Object.keys(prices); // Tüm coinler
  const coin = coins[Math.floor(Math.random() * coins.length)]; // Random coin seç
  const price = prices[coin];
  if (!price) return;

  const params = generateTradeParams();
  const usdAmount = tradingState.portfolio.usd * params.portfolioPercentage;
  const amount = usdAmount / price;

  const margin = (amount * price) / params.leverage;
  if (margin > 1 && margin <= tradingState.portfolio.usd) { // Minimum 1 USD
    tradingState.portfolio.usd -= margin;
    tradingState.portfolio.positions.push({
      id: Math.random().toString(36).substring(7),
      coin,
      type: params.type,
      leverage: params.leverage,
      entryPrice: price,
      amount,
      targetProfit: params.targetProfit,
      targetLoss: params.targetLoss,
      openTime: new Date().toISOString()
    });
    console.log(`Yeni pozisyon açıldı: ${coin} ${params.type} ${params.leverage}x`); // Debug log
  }
};

// State'i getir
app.get('/api/state', (req, res) => {
  res.json(tradingState);
});

// Pozisyon kapat
app.post('/api/position/close', (req, res) => {
  const { positionId, closePrice } = req.body;
  
  const positionIndex = tradingState.portfolio.positions.findIndex(p => p.id === positionId);
  
  if (positionIndex !== -1) {
    const position = tradingState.portfolio.positions[positionIndex];
    
    // PNL hesapla
    let pnl;
    if (position.type === 'LONG') {
      pnl = (closePrice - position.entryPrice) / position.entryPrice * 100 * position.leverage;
    } else {
      pnl = (position.entryPrice - closePrice) / position.entryPrice * 100 * position.leverage;
    }
    
    const margin = (position.amount * position.entryPrice) / position.leverage;
    const profit = margin * (pnl / 100);
    
    // Portföyü güncelle
    tradingState.portfolio.usd += margin + profit;
    
    const trade = {
      ...position,
      closePrice,
      closeTime: new Date().toISOString(),
      pnl,
      profit
    };
    
    tradingState.trades = [trade, ...tradingState.trades].slice(0, 100);
    tradingState.portfolio.positions.splice(positionIndex, 1);
    console.log(`Pozisyon kapatıldı: ${position.coin} PNL: ${pnl.toFixed(2)}%`); // Debug log
  }
  
  res.json({ success: true, state: tradingState });
});

// Fiyatları güncelle ve pozisyonları kontrol et
app.post('/api/prices/update', (req, res) => {
  const { prices } = req.body;
  
  // Fiyat geçmişini güncelle
  Object.entries(prices).forEach(([coin, price]) => {
    if (!tradingState.priceHistory[coin]) {
      tradingState.priceHistory[coin] = [];
    }
    
    tradingState.priceHistory[coin] = [
      ...tradingState.priceHistory[coin],
      {
        time: new Date().toISOString(),
        price
      }
    ].slice(-50);
  });
  
  // Trade yapmayı dene
  openPosition(prices);
  
  // Açık pozisyonları kontrol et
  tradingState.portfolio.positions.forEach(position => {
    const currentPrice = prices[position.coin];
    if (!currentPrice) return;
    
    let pnl;
    if (position.type === 'LONG') {
      pnl = (currentPrice - position.entryPrice) / position.entryPrice * 100 * position.leverage;
    } else {
      pnl = (position.entryPrice - currentPrice) / position.entryPrice * 100 * position.leverage;
    }
    
    if (pnl >= position.targetProfit || pnl <= position.targetLoss) {
      // Pozisyonu kapat
      const closeResponse = fetch(`${req.protocol}://${req.get('host')}/api/position/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position.id,
          closePrice: currentPrice
        })
      });
      console.log(`Pozisyon kapatma emri gönderildi: ${position.coin}`); // Debug log
    }
  });
  
  // Toplam değer ve performans hesapla
  const totalValue = tradingState.portfolio.usd +
    tradingState.portfolio.positions.reduce((acc, pos) => {
      const currentPrice = prices[pos.coin] || 0;
      let pnl;
      if (pos.type === 'LONG') {
        pnl = (currentPrice - pos.entryPrice) / pos.entryPrice * 100 * pos.leverage;
      } else {
        pnl = (pos.entryPrice - currentPrice) / pos.entryPrice * 100 * pos.leverage;
      }
      const margin = (pos.amount * pos.entryPrice) / pos.leverage;
      return acc + margin * (1 + pnl / 100);
    }, 0);
  
  const performance = ((totalValue - tradingState.portfolio.initialBalance) / 
    tradingState.portfolio.initialBalance) * 100;
  
  tradingState.performanceHistory = [
    ...tradingState.performanceHistory,
    {
      time: new Date().toISOString(),
      performance
    }
  ].slice(-50);
  
  res.json({ success: true, state: tradingState });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
