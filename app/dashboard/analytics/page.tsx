"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trade, DailyStats } from "@/types/database";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { differenceInHours } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Activity,
} from "lucide-react";

export default function AnalyticsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchAnalyticsData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: tradesData } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false });

      const { data: statsData } = await supabase
        .from("daily_stats")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true });

      if (tradesData) setTrades(tradesData);
      if (statsData) setDailyStats(statsData);
    } catch (error) {
      console.error("Error fetching analytics data:", error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Calculate metrics
  const calculateMetrics = () => {
    const closedTrades = trades.filter((t) => t.status === "CLOSED");

    // Best and worst trades
    const bestTrade = closedTrades.reduce(
      (best, trade) => ((trade.pnl || 0) > (best?.pnl || 0) ? trade : best),
      closedTrades[0]
    );

    const worstTrade = closedTrades.reduce(
      (worst, trade) => ((trade.pnl || 0) < (worst?.pnl || 0) ? trade : worst),
      closedTrades[0]
    );

    // Profit Factor calculation
    const winningTrades = closedTrades.filter((t) => t.pnl && t.pnl > 0);
    const losingTrades = closedTrades.filter((t) => t.pnl && t.pnl < 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(
      losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
    );
    const profitFactor =
      totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999.99 : 0;

    // Average holding time
    const holdingTimes = closedTrades
      .filter((t) => t.exit_date)
      .map((t) => {
        const entryDate = new Date(t.entry_date);
        const exitDate = new Date(t.exit_date!);
        return differenceInHours(exitDate, entryDate);
      });

    const avgHoldingTime =
      holdingTimes.length > 0
        ? holdingTimes.reduce((sum, time) => sum + time, 0) /
          holdingTimes.length
        : 0;

    // Win/Loss streak
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    closedTrades.forEach((trade) => {
      if (trade.pnl && trade.pnl > 0) {
        currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
        maxWinStreak = Math.max(maxWinStreak, currentStreak);
      } else if (trade.pnl && trade.pnl < 0) {
        currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
        maxLossStreak = Math.max(maxLossStreak, Math.abs(currentStreak));
      }
    });

    return {
      bestTrade,
      worstTrade,
      avgHoldingTime,
      maxWinStreak,
      maxLossStreak,
      profitFactor,
    };
  };

  const {
    bestTrade,
    worstTrade,
    avgHoldingTime,
    maxWinStreak,
    maxLossStreak,
    profitFactor,
  } = calculateMetrics();

  // Prepare data for charts
  const prepareSymbolPerformance = () => {
    const symbolData: {
      [key: string]: { pnl: number; trades: number; winRate: number };
    } = {};

    trades.forEach((trade) => {
      if (!symbolData[trade.symbol]) {
        symbolData[trade.symbol] = { pnl: 0, trades: 0, winRate: 0 };
      }

      symbolData[trade.symbol].trades++;
      if (trade.pnl) {
        symbolData[trade.symbol].pnl += trade.pnl;
        if (trade.pnl > 0) {
          symbolData[trade.symbol].winRate++;
        }
      }
    });

    return Object.entries(symbolData).map(([symbol, data]) => ({
      symbol,
      pnl: data.pnl,
      trades: data.trades,
      winRate: (data.winRate / data.trades) * 100,
    }));
  };

  const prepareDayOfWeekPerformance = () => {
    const dayData: { [key: number]: { pnl: number; trades: number } } = {};
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    trades.forEach((trade) => {
      const day = new Date(trade.entry_date).getDay();
      if (!dayData[day]) {
        dayData[day] = { pnl: 0, trades: 0 };
      }

      dayData[day].trades++;
      if (trade.pnl) {
        dayData[day].pnl += trade.pnl;
      }
    });

    return dayNames.map((name, index) => ({
      day: name,
      pnl: dayData[index]?.pnl || 0,
      trades: dayData[index]?.trades || 0,
      avgPnl: dayData[index] ? dayData[index].pnl / dayData[index].trades : 0,
    }));
  };

  const prepareWinLossDistribution = () => {
    const winningTrades = trades.filter((t) => t.pnl && t.pnl > 0).length;
    const losingTrades = trades.filter((t) => t.pnl && t.pnl < 0).length;
    const breakEvenTrades = trades.filter((t) => t.pnl === 0).length;

    return [
      { name: "Winning", value: winningTrades, color: "#10B981" },
      { name: "Losing", value: losingTrades, color: "#EF4444" },
      { name: "Break Even", value: breakEvenTrades, color: "#6B7280" },
    ];
  };

  const symbolPerformance = prepareSymbolPerformance();
  const dayOfWeekPerformance = prepareDayOfWeekPerformance();
  const winLossDistribution = prepareWinLossDistribution();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <p className="text-gray-400 mt-2">
          Deep dive into your trading performance
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Best Trade</p>
              <p className="text-2xl font-bold text-green-500 mt-2">
                ${bestTrade?.pnl?.toFixed(2) || "0.00"}
              </p>
              <p className="text-gray-500 text-xs mt-1">{bestTrade?.symbol}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Worst Trade</p>
              <p className="text-2xl font-bold text-red-500 mt-2">
                ${worstTrade?.pnl?.toFixed(2) || "0.00"}
              </p>
              <p className="text-gray-500 text-xs mt-1">{worstTrade?.symbol}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Profit Factor</p>
              <p className="text-2xl font-bold text-white mt-2">
                {profitFactor === 999.99 ? "∞" : profitFactor.toFixed(2)}
              </p>
              <p className="text-neutral-500 text-xs mt-1">
                {profitFactor > 1.5
                  ? "Excellent"
                  : profitFactor > 1.0
                  ? "Good"
                  : "Needs Improvement"}
              </p>
            </div>
            <Activity
              className={`w-8 h-8 ${
                profitFactor > 1.5
                  ? "text-green-500"
                  : profitFactor > 1.0
                  ? "text-yellow-500"
                  : "text-red-500"
              }`}
            />
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Avg Hold Time</p>
              <p className="text-2xl font-bold text-white mt-2">
                {avgHoldingTime.toFixed(1)}h
              </p>
              <p className="text-gray-500 text-xs mt-1">Per trade</p>
            </div>
            <Clock className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Best Streak</p>
              <p className="text-2xl font-bold text-white mt-2">
                {maxWinStreak}W / {maxLossStreak}L
              </p>
              <p className="text-gray-500 text-xs mt-1">Consecutive</p>
            </div>
            <Target className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Symbol Performance */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Performance by Symbol
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={symbolPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="symbol" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                }}
                labelStyle={{ color: "#9CA3AF" }}
              />
              <Bar dataKey="pnl" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Win/Loss Distribution */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Win/Loss Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={winLossDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {winLossDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                }}
                labelStyle={{ color: "#9CA3AF" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Day of Week Performance */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Performance by Day of Week
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={dayOfWeekPerformance}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="day" stroke="#9CA3AF" />
              <PolarRadiusAxis stroke="#9CA3AF" />
              <Radar
                name="P&L"
                dataKey="pnl"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.6}
              />
              <Radar
                name="Trades"
                dataKey="trades"
                stroke="#10B981"
                fill="#10B981"
                fillOpacity={0.6}
              />
              <Legend />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                }}
                labelStyle={{ color: "#9CA3AF" }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {/* P&L Distribution */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            P&L Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={trades
                .filter((t) => t.pnl !== null && t.pnl !== undefined)
                .map((t) => ({
                  pnl: t.pnl,
                  fill: t.pnl! >= 0 ? "#10B981" : "#EF4444",
                }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                }}
                labelStyle={{ color: "#9CA3AF" }}
              />
              <Bar dataKey="pnl" fill="#3B82F6">
                {trades
                  .filter((t) => t.pnl !== null && t.pnl !== undefined)
                  .map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.pnl! >= 0 ? "#10B981" : "#EF4444"}
                    />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
