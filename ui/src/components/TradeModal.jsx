import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { TRADEABLE_STOCKS } from "../data/tradeableStocks";
import { fetchSymbolQuote } from "../services/marketData";

export const TradeModal = ({
  isOpen,
  onClose,
  holding,
  cash,
  holdings,
  morningBriefing,
  tradingMode,
  onExecuteTrade,
}) => {
  const manualTradingDisabled = tradingMode === "autonomous_agent";
  const isAddPurchaseFlow = !holding;
  const [mode, setMode] = useState("buy");
  const [shares, setShares] = useState("0");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [symbolInput, setSymbolInput] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [lookedUpStock, setLookedUpStock] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const allStocks = useMemo(() => {
    const heldSymbols = new Set(holdings.map((portfolioStock) => portfolioStock.symbol));
    const heldStocks = holdings.map((portfolioStock) => ({
      symbol: portfolioStock.symbol,
      name: portfolioStock.name,
      sector: portfolioStock.sector,
      price: portfolioStock.price,
    }));
    const unheldStocks = TRADEABLE_STOCKS.filter(
      (stock) => !heldSymbols.has(stock.symbol)
    );
    return [...heldStocks, ...unheldStocks];
  }, [holdings]);

  const aiIdeas = useMemo(
    () =>
      (morningBriefing?.cash_deployment_options || [])
        .slice(0, 5)
        .map((idea) => ({
          symbol: String(idea.symbol || "").toUpperCase(),
          name: idea.symbol || "AI Candidate",
          sector: idea.sector || "AI Idea",
          confidence: Number(idea.confidence) || 0,
        }))
        .filter((idea) => idea.symbol),
    [morningBriefing]
  );

  const stocksBySymbol = useMemo(() => {
    const map = new Map();
    allStocks.forEach((stock) => {
      map.set(stock.symbol.toUpperCase(), stock);
    });
    aiIdeas.forEach((idea) => {
      if (!map.has(idea.symbol)) {
        map.set(idea.symbol, idea);
      }
    });
    if (lookedUpStock?.symbol) {
      map.set(lookedUpStock.symbol.toUpperCase(), lookedUpStock);
    }
    return map;
  }, [allStocks, aiIdeas, lookedUpStock]);

  const displayStock =
    holding ||
    stocksBySymbol.get(selectedSymbol.toUpperCase()) ||
    allStocks[0] ||
    null;
  const selectedPrice = Number(displayStock?.price) || 0;
  const manualPrice = Number(customPrice);
  const price = Number.isFinite(manualPrice) && manualPrice > 0 ? manualPrice : selectedPrice;
  const owned =
    holdings.find((portfolioStock) => portfolioStock.symbol === displayStock?.symbol)
      ?.shares ?? 0;
  const estimatedTotal = (Number(shares) || 0) * price;
  const invalidShares = !Number(shares) || Number(shares) <= 0;
  const insufficientCash = mode === "buy" && estimatedTotal > cash;
  const insufficientShares = mode === "sell" && Number(shares) > owned;
  const cannotSellSelectedStock = mode === "sell" && owned <= 0;
  const missingPrice = !Number(price) || Number(price) <= 0;
  const disablePlaceOrder =
    manualTradingDisabled ||
    !displayStock ||
    invalidShares ||
    missingPrice ||
    insufficientCash ||
    insufficientShares ||
    cannotSellSelectedStock;

  useEffect(() => {
    if (isOpen) {
      setShares("0");
      setMode("buy");
      setSelectedSymbol(holding?.symbol || allStocks[0]?.symbol || "");
      setSymbolInput(holding?.symbol || allStocks[0]?.symbol || "");
      setCustomPrice("");
      setLookedUpStock(null);
      setLookupError("");
    }
  }, [isOpen, holding, allStocks]);

  useEffect(() => {
    if (selectedSymbol) {
      setSymbolInput(selectedSymbol.toUpperCase());
      const stock = stocksBySymbol.get(selectedSymbol.toUpperCase());
      if (stock?.price) {
        setCustomPrice(String(stock.price));
      }
    }
  }, [selectedSymbol, stocksBySymbol]);

  const handleLookup = async () => {
    const normalized = symbolInput.trim().toUpperCase();
    if (!normalized) {
      setLookupError("Enter a ticker symbol to look up.");
      return;
    }
    const existing = stocksBySymbol.get(normalized);
    if (existing?.price) {
      setLookupError("");
      setSelectedSymbol(normalized);
      setCustomPrice(String(existing.price));
      return;
    }

    setIsLookingUp(true);
    setLookupError("");
    try {
      const quote = await fetchSymbolQuote(normalized);
      const next = {
        symbol: String(quote.symbol || normalized).toUpperCase(),
        name: String(quote.name || normalized),
        sector: "Other",
        price: Number(quote.price) || 0,
      };
      if (!next.price) {
        throw new Error(`Price unavailable for ${normalized}.`);
      }
      setLookedUpStock(next);
      setSelectedSymbol(next.symbol);
      setCustomPrice(String(next.price));
    } catch (error) {
      setLookupError(error?.message || `Unable to look up ${normalized}.`);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handlePlaceOrder = () => {
    const numShares = Number(shares);
    if (!numShares || numShares <= 0 || !displayStock) return;

    if (mode === "buy") {
      const cost = displayStock.price * numShares;
      if (cash < cost) return;
      onExecuteTrade({
        type: "BUY_ADD_HOLDING",
        payload: {
          symbol: displayStock.symbol,
          name: displayStock.name,
          sector: displayStock.sector,
          price: displayStock.price,
          shares: numShares,
        },
      });
    } else {
      if (owned <= 0 || owned < numShares) return;
      onExecuteTrade({
        type: "SELL_HOLDING",
        payload: {
          symbol: displayStock.symbol,
          name: displayStock.name,
          shares: numShares,
          price: displayStock.price,
        },
      });
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">
            {isAddPurchaseFlow ? "Add Purchase" : "Trade Stock"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          <div className="bg-slate-100 p-1.5 rounded-2xl flex mb-8">
            <button
              onClick={() => setMode("buy")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all",
                mode === "buy"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              Buy
            </button>
            <button
              onClick={() => setMode("sell")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all",
                mode === "sell"
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              Sell
            </button>
          </div>

          {isAddPurchaseFlow && allStocks.length > 0 && (
            <div className="mb-8">
              {mode === "buy" && aiIdeas.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest mb-2">
                    AI shortlist
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {aiIdeas.map((idea) => (
                      <button
                        key={`ai-${idea.symbol}`}
                        onClick={() => {
                          setSelectedSymbol(idea.symbol);
                          setSymbolInput(idea.symbol);
                        }}
                        className="px-3 py-1.5 rounded-full border border-teal-200 bg-teal-50 text-teal-700 text-[10px] font-black uppercase tracking-widest hover:bg-teal-100 transition-colors"
                      >
                        {idea.symbol} ({Math.round(idea.confidence * 100)}%)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Enter Ticker
              </label>
              <div className="mb-4 flex gap-2">
                <input
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                  placeholder="e.g. AMD"
                  className="flex-1 rounded-2xl border-slate-200 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-sm font-bold py-3 px-4 uppercase"
                />
                <button
                  onClick={handleLookup}
                  disabled={isLookingUp}
                  className="px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  {isLookingUp ? "..." : "Lookup"}
                </button>
              </div>
              {lookupError && (
                <p className="mb-3 text-xs font-medium text-rose-600">{lookupError}</p>
              )}

              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Select Stock
              </label>
              <select
                value={displayStock?.symbol ?? selectedSymbol ?? allStocks[0]?.symbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="block w-full rounded-2xl border-slate-200 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-sm font-bold py-4 px-6"
              >
                {Array.from(stocksBySymbol.values()).map((stock) => (
                  <option key={stock.symbol} value={stock.symbol}>
                    {stock.symbol} - {stock.name}
                    {Number(stock.price) > 0 ? ` ($${Number(stock.price).toFixed(2)})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {displayStock && (
            <>
              <div className="mb-8 flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-teal-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl">
                    {displayStock.symbol}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900">
                      {displayStock.name}
                    </h3>
                    <p className="text-sm font-medium text-slate-500">
                      ${Number(price).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {mode === "buy" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Price Per Share
                    </label>
                    <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        className="block w-full rounded-2xl border-slate-200 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-xl font-bold py-3 pl-12 pr-6 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Number of Shares
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                      className="block w-full rounded-2xl border-slate-200 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-2xl font-bold py-4 pl-6 pr-32 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      placeholder="0"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm tracking-widest">
                      SHARES
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm px-1">
                  <div>
                    <span className="text-slate-500 font-medium">
                      {mode === "buy" ? "Available Cash:" : "Available Shares:"}
                    </span>
                    <span className="font-bold text-slate-900 ml-2">
                      {mode === "buy"
                        ? `$${cash.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}`
                        : `${owned.toFixed(2)} ${displayStock.symbol}`}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 font-medium">Est. Total:</span>
                    <span className="font-black text-slate-900 ml-2">
                      $
                      {estimatedTotal.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                {mode === "sell" && owned <= 0 && (
                  <p className="text-sm font-medium text-rose-600">
                    You do not currently own this stock, so there are no shares to sell.
                  </p>
                )}
                {mode === "buy" && insufficientCash && (
                  <p className="text-sm font-medium text-rose-600">
                    This order exceeds your available cash.
                  </p>
                )}
                {mode === "buy" && missingPrice && (
                  <p className="text-sm font-medium text-rose-600">
                    Enter a valid price, or use Lookup to fetch one.
                  </p>
                )}
                {mode === "sell" && insufficientShares && owned > 0 && (
                  <p className="text-sm font-medium text-rose-600">
                    You cannot sell more shares than you currently own.
                  </p>
                )}
                {manualTradingDisabled && (
                  <p className="text-sm font-medium text-amber-700">
                    Autonomous mode is active. Manual order placement is currently disabled.
                  </p>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={disablePlaceOrder}
                  className={cn(
                    "w-full py-5 text-white font-black rounded-2xl shadow-lg transition-all transform active:scale-[0.98] text-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
                    mode === "buy"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-200",
                  )}
                >
                  Place {mode === "buy" ? "Buy" : "Sell"} Order
                </button>
              </div>
            </>
          )}

          {isAddPurchaseFlow && allStocks.length === 0 && (
            <p className="text-slate-500 text-sm font-medium text-center py-8">
              No stocks are currently available for trading.
            </p>
          )}

          <p className="text-center text-[10px] font-bold text-slate-400 mt-8 px-6 uppercase tracking-widest leading-relaxed">
            Orders placed after market hours will be executed at the opening
            price of the next trading day.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};
