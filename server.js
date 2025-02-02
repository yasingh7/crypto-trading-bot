import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

// Fiyat formatlama fonksiyonu
const formatPrice = (price) => {
  if (typeof price !== 'number') return '-';
  
  // 1'den büyük sayılar için 2 ondalık
  if (price >= 1) {
    return `${price.toFixed(2)}`;
  }
  
  // 0.0001'den küçük sayılar için bilimsel gösterim
  if (price < 0.0001) {
    return `${price.toExponential(4)}`;
  }
  
  // 1'den küçük sayılar için anlamlı basamaklar
  const decimals = Math.max(8, -Math.floor(Math.log10(price)) + 3);
  return `${price.toFixed(decimals)}`;
};

const MultiCryptoTrader = () => {
  const [state, setState] = useState({
    portfolio: {
      usd: 10000,
      initialBalance: 10000,
      positions: []
    },
    currentPrices: {},
    trades: [],
    priceHistory: {},
    performanceHistory: [],
    startTime: new Date().toISOString()
  });

  // Backend'den state'i al
  const fetchState = async () => {
    try {
      const response = await fetch('https://crypto-trading-bot-9htp.onrender.com/api/state');
      const data = await response.json();
      setState(prevState => ({
        ...data,
        currentPrices: prevState.currentPrices
      }));
    } catch (error) {
      console.error('State alınamadı:', error);
    }
  };

  // CoinGecko API'den top 100 coin fiyatlarını al
  const fetchPrices = async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false'
      );
      const data = await response.json();
      const prices = data.reduce((acc, coin) => {
        acc[coin.symbol.toUpperCase()] = coin.current_price;
        return acc;
      }, {});

      setState(prev => ({ ...prev, currentPrices: prices }));
      return prices;
    } catch (error) {
      console.error('Fiyatlar çekilemedi:', error);
      return null;
    }
  };

  // Fiyat güncellemesi ve pozisyon kontrolü
  useEffect(() => {
    const updatePrices = async () => {
      const prices = await fetchPrices();
      if (prices) {
        try {
          const response = await fetch('https://crypto-trading-bot-9htp.onrender.com/api/prices/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prices }),
          });

          const data = await response.json();
          if (data.success) {
            setState(prev => ({
              ...data.state,
              currentPrices: prev.currentPrices
            }));
          }
        } catch (error) {
          console.error('Fiyatlar güncellenemedi:', error);
        }
      }
    };

    fetchState();
    updatePrices();
    const interval = setInterval(updatePrices, 15000);
    return () => clearInterval(interval);
  }, []);

  const totalValue = state.portfolio.usd +
    state.portfolio.positions.reduce((acc, pos) => {
      const currentPrice = state.currentPrices[pos.coin] || 0;
      let pnlPercentage = pos.type === 'LONG'
        ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage
        : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100 * pos.leverage;
      
      const pnlUsd = pos.notionalSize * (pnlPercentage / 100);
      return acc + pos.margin + pnlUsd;
    }, 0);

  const performance = ((totalValue - state.portfolio.initialBalance) /
    state.portfolio.initialBalance) * 100;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-6">Kripto Trading Bot</h1>

        {/* Portfolio Özeti */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold">Portfolio</h3>
            <p>USD: ${formatPrice(state.portfolio.usd)}</p>
            <p>Toplam: ${formatPrice(totalValue)}</p>
            <p className={performance >= 0 ? 'text-green-600' : 'text-red-600'}>
              {performance >= 0 ? '+' : ''}{performance.toFixed(2)}%
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold">Açık Pozisyonlar</h3>
            <p>{state.portfolio.positions.length} / 3</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold">Toplam İşlem</h3>
            <p>{state.trades.length}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold">Başlangıç</h3>
            <p>{new Date(state.startTime).toLocaleString()}</p>
          </div>
        </div>

        {/* Performans Grafiği */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Günlük Performans Grafiği</h3>
          <div className="h-64 bg-white rounded-lg">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={state.dailyPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date"
                  tickFormatter={(date) => {
                    const d = new Date(date);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(date) => {
                    const d = new Date(date);
                    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                  }}
                  formatter={(value) => [`${value.toFixed(2)}%`, 'Performans']}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="performance" 
                  stroke="#8884d8" 
                  name="Günlük Kâr/Zarar %" 
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Açık Pozisyonlar Tablosu */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Açık Pozisyonlar</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">Coin</th>
                  <th className="px-4 py-3 text-left">Yön</th>
                  <th className="px-4 py-3 text-left">Kaldıraç</th>
                  <th className="px-4 py-3 text-left">Marjin</th>
                  <th className="px-4 py-3 text-left">Poz. Büyüklüğü</th>
                  <th className="px-4 py-3 text-left">Giriş</th>
                  <th className="px-4 py-3 text-left">Güncel</th>
                  <th className="px-4 py-3 text-left">PNL %</th>
                  <th className="px-4 py-3 text-left">PNL $</th>
                  <th className="px-4 py-3 text-left">TP/SL</th>
                </tr>
              </thead>
              <tbody>
                {state.portfolio.positions.map((position) => {
                  const currentPrice = state.currentPrices[position.coin] || 0;
                  let pnlPercentage = position.type === 'LONG'
                    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage
                    : ((position.entryPrice - currentPrice) / position.entryPrice) * 100 * position.leverage;
                  
                  const pnlUsd = position.notionalSize * (pnlPercentage / 100);

                  return (
                    <tr key={position.id} className="border-t">
                      <td className="px-4 py-3">{position.coin}</td>
                      <td className={`px-4 py-3 ${position.type === 'LONG' ? 'text-green-600' : 'text-red-600'}`}>
                        {position.type}
                      </td>
                      <td className="px-4 py-3">{position.leverage}x</td>
                      <td className="px-4 py-3">{formatPrice(position.margin)}</td>
                      <td className="px-4 py-3">{formatPrice(position.notionalSize)}</td>
                      <td className="px-4 py-3">{formatPrice(position.entryPrice)}</td>
                      <td className="px-4 py-3">{formatPrice(currentPrice)}</td>
                      <td className={`px-4 py-3 ${pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 ${pnlUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        +{position.targetProfit.toFixed(1)}% / {position.targetLoss.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kapalı Pozisyonlar Tablosu */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Son İşlemler</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">Coin</th>
                  <th className="px-4 py-3 text-left">Yön</th>
                  <th className="px-4 py-3 text-left">Kaldıraç</th>
                  <th className="px-4 py-3 text-left">Marjin</th>
                  <th className="px-4 py-3 text-left">Poz. Büyüklüğü</th>
                  <th className="px-4 py-3 text-left">Giriş</th>
                  <th className="px-4 py-3 text-left">Çıkış</th>
                  <th className="px-4 py-3 text-left">PNL %</th>
                  <th className="px-4 py-3 text-left">PNL $</th>
                  <th className="px-4 py-3 text-left">Hedef TP/SL</th>
                  <th className="px-4 py-3 text-left">Kapanış Nedeni</th>
                  <th className="px-4 py-3 text-left">Kapanış</th>
                </tr>
              </thead>
              <tbody>
                {state.trades.slice(0, 10).map((trade, index) => {
                  const getCloseReasonDisplay = (reason) => {
                    switch(reason) {
                      case 'TP':
                        return { text: 'Take Profit', color: 'text-green-600' };
                      case 'SL':
                        return { text: 'Stop Loss', color: 'text-red-600' };
                      case 'TIME':
                        return { text: '24s Limit', color: 'text-gray-600' };
                      default:
                        return { text: reason, color: 'text-gray-600' };
                    }
                  };
                  
                  const closeReasonStyle = getCloseReasonDisplay(trade.closeReason);
                  
                  return (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-3">{trade.coin}</td>
                      <td className={`px-4 py-3 ${trade.type === 'LONG' ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.type}
                      </td>
                      <td className="px-4 py-3">{trade.leverage}x</td>
                      <td className="px-4 py-3">{formatPrice(trade.margin)}</td>
                      <td className="px-4 py-3">{formatPrice(trade.notionalSize)}</td>
                      <td className="px-4 py-3">{formatPrice(trade.entryPrice)}</td>
                      <td className="px-4 py-3">{formatPrice(trade.closePrice)}</td>
                      <td className={`px-4 py-3 ${trade.pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.pnlPercentage >= 0 ? '+' : ''}{trade.pnlPercentage.toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 ${trade.pnlUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.pnlUsd >= 0 ? '+' : ''}${trade.pnlUsd.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        +{trade.targetProfit.toFixed(1)}% / {trade.targetLoss.toFixed(1)}%
                      </td>
                      <td className={`px-4 py-3 ${closeReasonStyle.color}`}>
                        {closeReasonStyle.text}
                      </td>
                      <td className="px-4 py-3">
                        {new Date(trade.closeTime).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiCryptoTrader;
