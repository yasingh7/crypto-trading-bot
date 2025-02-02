const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

// Rate limiter ayarları
const limiter = rateLimit({
  windowMs: 1000,
  max: 5,
  message: { error: 'Çok fazla istek gönderildi, lütfen birkaç saniye bekleyin.' }
});

app.use(cors());
app.use(express.json());
app.use(limiter);

// Trading durumu
let tradingState = {
  portfolio: {
    usd: 10000, // Mevcut USD
    initialBalance: 10000, // Başlangıç bakiyesi
    totalPnl: 0, // Toplam realize edilmiş kar/zarar
    positions: []
  },
  trades: [],
  priceHistory: {},
  dailyPerformance: [],
  startTime: new Date().toISOString()
};

// Trading stratejisi ve trade parametre fonksiyonları aynı kalıyor
// ...

// Pozisyon kapat
app.post('/api/position/close', (req, res) => {
  const { positionId, closePrice } = req.body;
  
  const positionIndex = tradingState.portfolio.positions.findIndex(p => p.id === positionId);
  
  if (positionIndex !== -1) {
    const position = tradingState.portfolio.positions[positionIndex];
    
    // PNL hesaplama
    let pnlPercentage;
    if (position.type === 'LONG') {
      pnlPercentage = ((closePrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage;
    } else {
      pnlPercentage = ((position.entryPrice - closePrice) / position.entryPrice) * 100 * position.leverage;
    }
    
    // Dolar cinsinden PNL
    const pnlUsd = position.notionalSize * (pnlPercentage / 100);
    
    // Margin + PNL'i hesaba ekle
    tradingState.portfolio.usd += position.margin + pnlUsd;
    
    // Toplam realize edilmiş PNL'i güncelle
    tradingState.portfolio.totalPnl += pnlUsd;
    
    const trade = {
      ...position,
      closePrice,
      closeTime: new Date().toISOString(),
      pnlPercentage,
      pnlUsd
    };
    
    tradingState.trades = [trade, ...tradingState.trades].slice(0, 100);
    tradingState.portfolio.positions.splice(positionIndex, 1);
    console.log(`Pozisyon kapatıldı: ${position.coin} PNL: ${pnlPercentage.toFixed(2)}% ($${pnlUsd.toFixed(2)})`);
  }
  
  res.json({ success: true, state: tradingState });
});

// Fiyatları güncelle ve pozisyonları kontrol et
app.post('/api/prices/update', (req, res) => {
  const { prices } = req.body;
  
  Object.entries(prices).forEach(([coin, price]) => {
    if (!tradingState.priceHistory[coin]) {
      tradingState.priceHistory[coin] = [];
    }
    tradingState.priceHistory[coin] = [...tradingState.priceHistory[coin], { time: new Date().toISOString(), price }].slice(-50);
  });
  
  openPosition(prices);
  
  // Açık pozisyonları kontrol et ve unrealized PnL hesapla
  let unrealizedPnl = 0;
  tradingState.portfolio.positions.forEach(position => {
    const currentPrice = prices[position.coin];
    if (!currentPrice) return;
    
    let pnlPercentage;
    if (position.type === 'LONG') {
      pnlPercentage = ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage;
    } else {
      pnlPercentage = ((position.entryPrice - currentPrice) / position.entryPrice) * 100 * position.leverage;
    }
    
    const pnlUsd = position.notionalSize * (pnlPercentage / 100);
    unrealizedPnl += pnlUsd;
    
    if (pnlPercentage >= position.targetProfit || pnlPercentage <= position.targetLoss) {
      fetch(`${req.protocol}://${req.get('host')}/api/position/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position.id,
          closePrice: currentPrice
        })
      });
    }
  });
  
  // Portfolio performansını hesapla (realized + unrealized)
  const totalValue = tradingState.portfolio.usd + unrealizedPnl;
  const performance = ((totalValue - tradingState.portfolio.initialBalance) / 
    tradingState.portfolio.initialBalance) * 100;
  
  // Günlük performans güncelleme
  const today = new Date().toISOString().split('T')[0];
  const existingDayIndex = tradingState.dailyPerformance.findIndex(
    day => day.date === today
  );
  
  if (existingDayIndex === -1) {
    tradingState.dailyPerformance.push({
      date: today,
      performance
    });
  } else {
    tradingState.dailyPerformance[existingDayIndex].performance = performance;
  }
  
  tradingState.dailyPerformance = tradingState.dailyPerformance.slice(-30);
  
  res.json({ success: true, state: tradingState });
});

// ... error handlers ve server.listen aynı kalıyor
