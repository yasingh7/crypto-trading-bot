const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

// Rate limiter ayarları
const limiter = rateLimit({
  windowMs: 1000, // 1 saniye
  max: 5, // Her IP için maksimum 5 istek
  message: { error: 'Çok fazla istek gönderildi, lütfen birkaç saniye bekleyin.' }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Hata yakalandı:', err);
  res.status(500).json({ error: 'Sunucu hatası oluştu, yeniden deneniyor...' });
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('Beklenmeyen hata:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('İşlenmeyen Promise reddi:', err);
});

app.use(cors());
app.use(express.json());
app.use(limiter); // Rate limiting tüm routelara uygulanıyor

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
  dailyPerformance: [], // Günlük performans verisi
  startTime: new Date().toISOString()
};

// Trading stratejisi
const shouldTrade = () => {
  console.log("Trade kontrolü yapılıyor...");
  return Math.random() < 0.8;
};

// Trade parametreleri 
const generateTradeParams = () => {
  return {
    type: Math.random() > 0.5 ? 'LONG' : 'SHORT',
    leverage: Math.floor(Math.random() * 10) + 1,
    targetProfit: (Math.random() * 30),
    targetLoss: -(Math.random() * 30),
    // Marjin kasanın %1 ile %5'i arası
    marginPercentage: 0.01 + (Math.random() * 0.04)
  };
};

// Pozisyon aç
const openPosition = async (prices) => {
  // Maximum 3 açık pozisyon kontrolü
  if (tradingState.portfolio.positions.length >= 5) return;

  if (!shouldTrade()) return;

  const coins = Object.keys(prices);
  const coin = coins[Math.floor(Math.random() * coins.length)];
  const price = prices[coin];
  if (!price) return;

  const params = generateTradeParams();
  
  // Marjin hesaplama (kasanın %1-%5'i arası)
  const margin = tradingState.portfolio.usd * params.marginPercentage;
  
  // Notional size (pozisyon büyüklüğü) hesaplama
  const notionalSize = margin * params.leverage;
  
  // Coin miktarı hesaplama
  const amount = notionalSize / price;

  if (margin > 1 && margin <= tradingState.portfolio.usd) {
    tradingState.portfolio.usd -= margin;
    tradingState.portfolio.positions.push({
      id: Math.random().toString(36).substring(7),
      coin,
      type: params.type,
      leverage: params.leverage,
      entryPrice: price,
      amount,
      margin,
      notionalSize,
      targetProfit: params.targetProfit,
      targetLoss: params.targetLoss,
      openTime: new Date().toISOString()
    });
    console.log(`Yeni pozisyon açıldı: ${coin} ${params.type} ${params.leverage}x`);
  }
};

// Pozisyon kapat
app.post('/api/position/close', (req, res) => {
  const { positionId, closePrice } = req.body;
  
  const positionIndex = tradingState.portfolio.positions.findIndex(p => p.id === positionId);
  
  if (positionIndex !== -1) {
    const position = tradingState.portfolio.positions[positionIndex];
    
    // PNL hesaplama (pozisyon büyüklüğüne göre)
    let pnlPercentage;
    if (position.type === 'LONG') {
      pnlPercentage = ((closePrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage;
    } else {
      pnlPercentage = ((position.entryPrice - closePrice) / position.entryPrice) * 100 * position.leverage;
    }
    
    // Dolar cinsinden PNL
    const pnlUsd = position.notionalSize * (pnlPercentage / 100);
    
    tradingState.portfolio.usd += position.margin + pnlUsd;
    
    // Kapanma sebebini belirle
    let closeReason;
    if (isOver24Hours) {
      closeReason = 'TIME';
    } else if (pnlPercentage >= position.targetProfit) {
      closeReason = 'TP';
    } else {
      closeReason = 'SL';
    }

    const trade = {
      ...position,
      closePrice,
      closeTime: new Date().toISOString(),
      pnlPercentage,
      pnlUsd,
      closeReason
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
    
    tradingState.priceHistory[coin] = [
      ...tradingState.priceHistory[coin],
      { time: new Date().toISOString(), price }
    ].slice(-50);
  });
  
  // Trade yapmayı dene
  openPosition(prices);
  
  // Açık pozisyonları kontrol et
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
    
    // 24 saat geçmiş mi kontrol et
    const positionAge = new Date() - new Date(position.openTime);
    const isOver24Hours = positionAge >= 24 * 60 * 60 * 1000; // 24 saat milisaniye cinsinden
    
    if (pnlPercentage >= position.targetProfit || 
        pnlPercentage <= position.targetLoss || 
        isOver24Hours) {
      const closeResponse = fetch(`${req.protocol}://${req.get('host')}/api/position/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position.id,
          closePrice: currentPrice
        })
      });
      console.log(`Pozisyon kapatma emri gönderildi: ${position.coin}`);
    }
  });
  
  // Toplam portfolio değeri hesaplama
  const totalValue = tradingState.portfolio.usd +
    tradingState.portfolio.positions.reduce((acc, pos) => {
      const currentPrice = prices[pos.coin] || 0;
      let pnlPercentage;
      if (pos.type === 'LONG') {
        pnlPercentage = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage;
      } else {
        pnlPercentage = ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100 * pos.leverage;
      }
      
      const pnlUsd = pos.notionalSize * (pnlPercentage / 100);
      return acc + pos.margin + pnlUsd;
    }, 0);
  
  const performance = ((totalValue - tradingState.portfolio.initialBalance) / 
    tradingState.portfolio.initialBalance) * 100;
  
  // Günün tarihini al (saat olmadan)
  const today = new Date().toISOString().split('T')[0];
  
  // Günlük performans güncelleme
  const existingDayIndex = tradingState.dailyPerformance.findIndex(
    day => day.date === today
  );
  
  if (existingDayIndex === -1) {
    // Yeni gün başlangıcı
    tradingState.dailyPerformance.push({
      date: today,
      performance: performance
    });
  } else {
    // Mevcut günü güncelle
    tradingState.dailyPerformance[existingDayIndex].performance = performance;
  }
  
  // Son 30 günü tut
  tradingState.dailyPerformance = tradingState.dailyPerformance.slice(-30);
  
  res.json({ success: true, state: tradingState });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
