"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trade, DailyStats } from "@/types/database";
import {
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { format, parseISO } from "date-fns";
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Activity,
} from "lucide-react";

interface DashboardStats {
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalPnL: 0,
    winRate: 0,
    totalTrades: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch trades
      const { data: tradesData } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false });

      // Fetch daily stats
      const { data: statsData } = await supabase
        .from("daily_stats")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true });

      if (tradesData) {
        setTrades(tradesData);
        calculateDashboardStats(tradesData);
      }

      if (statsData) {
        setDailyStats(statsData);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDashboardStats = (trades: Trade[]) => {
    const closedTrades = trades.filter((t) => t.status === "CLOSED");
    const winningTrades = closedTrades.filter((t) => t.pnl && t.pnl > 0);
    const losingTrades = closedTrades.filter((t) => t.pnl && t.pnl < 0);

    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(
      losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
    );

    setDashboardStats({
      totalPnL,
      winRate:
        closedTrades.length > 0
          ? (winningTrades.length / closedTrades.length) * 100
          : 0,
      totalTrades: trades.length,
      avgWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0,
    });
  };

  // Prepare chart data
  const chartData = dailyStats.map((stat) => ({
    date: format(parseISO(stat.date), "MMM dd"),
    pnl: stat.total_pnl,
    trades: stat.total_trades,
    winRate: stat.win_rate,
  }));

  // Calculate cumulative P&L
  let cumulativePnL = 0;
  const cumulativeData = chartData.map((day) => {
    cumulativePnL += day.pnl;
    return {
      ...day,
      cumulativePnL,
    };
  });

  const StatCard = ({ title, value, subtitle, icon: Icon, trend }: any) => (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold text-white mt-2">{value}</p>
          {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
        </div>
        <div
          className={`p-3 rounded-lg ${
            trend === "up"
              ? "bg-green-500/10"
              : trend === "down"
              ? "bg-red-500/10"
              : "bg-blue-500/10"
          }`}
        >
          <Icon
            className={`w-6 h-6 ${
              trend === "up"
                ? "text-green-500"
                : trend === "down"
                ? "text-red-500"
                : "text-blue-500"
            }`}
          />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-2">Track your trading performance</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total P&L"
          value={`$${dashboardStats.totalPnL.toFixed(2)}`}
          subtitle="All time"
          icon={dashboardStats.totalPnL >= 0 ? ArrowUpRight : ArrowDownRight}
          trend={dashboardStats.totalPnL >= 0 ? "up" : "down"}
        />
        <StatCard
          title="Win Rate"
          value={`${dashboardStats.winRate.toFixed(1)}%`}
          subtitle={`${dashboardStats.totalTrades} trades`}
          icon={TrendingUp}
          trend="neutral"
        />
        <StatCard
          title="Profit Factor"
          value={dashboardStats.profitFactor.toFixed(2)}
          subtitle="Risk/Reward"
          icon={Activity}
          trend="neutral"
        />
        <StatCard
          title="Average Win"
          value={`$${dashboardStats.avgWin.toFixed(2)}`}
          subtitle={`Loss: $${dashboardStats.avgLoss.toFixed(2)}`}
          icon={TrendingUp}
          trend="neutral"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumulative P&L Chart */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Cumulative P&L
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                }}
                labelStyle={{ color: "#9CA3AF" }}
              />
              <Line
                type="monotone"
                dataKey="cumulativePnL"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Daily P&L and Trade Count */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Daily Performance
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis yAxisId="left" stroke="#9CA3AF" />
              <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                }}
                labelStyle={{ color: "#9CA3AF" }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="pnl" fill="#3B82F6" name="P&L" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="trades"
                stroke="#10B981"
                name="Trades"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Trades Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Trades</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 border-b border-gray-700">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4">Side</th>
                <th className="py-3 px-4">Entry</th>
                <th className="py-3 px-4">Exit</th>
                <th className="py-3 px-4">P&L</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {trades.slice(0, 5).map((trade) => (
                <tr key={trade.id} className="border-b border-gray-700">
                  <td className="py-3 px-4">
                    {format(parseISO(trade.entry_date), "MMM dd, yyyy")}
                  </td>
                  <td className="py-3 px-4 font-medium">{trade.symbol}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.side === "LONG"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="py-3 px-4">${trade.entry_price}</td>
                  <td className="py-3 px-4">
                    {trade.exit_price ? `$${trade.exit_price}` : "-"}
                  </td>
                  <td className="py-3 px-4">
                    {trade.pnl ? (
                      <span
                        className={
                          trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                        }
                      >
                        ${trade.pnl.toFixed(2)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.status === "OPEN"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-gray-500/10 text-gray-400"
                      }`}
                    >
                      {trade.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
