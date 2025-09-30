"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trade } from "@/types/database";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { Plus, Edit2, Trash2, Filter } from "lucide-react";

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [sortBy, setSortBy] = useState<"date" | "pnl">("date");
  const supabase = createClient();

  useEffect(() => {
    fetchTrades();
  }, []);

  useEffect(() => {
    filterAndSortTrades();
  }, [trades, filter, sortBy]);

  const fetchTrades = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false });

      if (error) throw error;
      if (data) setTrades(data);
    } catch (error) {
      console.error("Error fetching trades:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortTrades = () => {
    let filtered = [...trades];

    // Apply filter
    if (filter !== "ALL") {
      filtered = filtered.filter((trade) => trade.status === filter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === "date") {
        return (
          new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
        );
      } else if (sortBy === "pnl") {
        return (b.pnl || 0) - (a.pnl || 0);
      }
      return 0;
    });

    setFilteredTrades(filtered);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trade?")) return;

    try {
      const { error } = await supabase.from("trades").delete().eq("id", id);

      if (error) throw error;
      setTrades(trades.filter((trade) => trade.id !== id));
    } catch (error) {
      console.error("Error deleting trade:", error);
      alert("Error deleting trade");
    }
  };

  const calculateTotals = () => {
    const totalPnL = filteredTrades.reduce(
      (sum, trade) => sum + (trade.pnl || 0),
      0
    );
    const winningTrades = filteredTrades.filter(
      (trade) => trade.pnl && trade.pnl > 0
    ).length;
    const losingTrades = filteredTrades.filter(
      (trade) => trade.pnl && trade.pnl < 0
    ).length;
    const winRate =
      filteredTrades.length > 0
        ? (winningTrades /
            filteredTrades.filter((t) => t.status === "CLOSED").length) *
          100
        : 0;

    return { totalPnL, winningTrades, losingTrades, winRate };
  };

  const { totalPnL, winningTrades, losingTrades, winRate } = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white">Loading trades...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Trades</h1>
          <p className="text-gray-400 mt-2">Manage your trading history</p>
        </div>
        <Link
          href="/dashboard/trades/new"
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Trade
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total P&L</p>
          <p
            className={`text-2xl font-bold ${
              totalPnL >= 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            ${totalPnL.toFixed(2)}
          </p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Win Rate</p>
          <p className="text-2xl font-bold text-white">{winRate.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Winning Trades</p>
          <p className="text-2xl font-bold text-green-500">{winningTrades}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Losing Trades</p>
          <p className="text-2xl font-bold text-red-500">{losingTrades}</p>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400 text-sm">Filter:</span>
            <div className="flex gap-2">
              {["ALL", "OPEN", "CLOSED"].map((filterOption) => (
                <button
                  key={filterOption}
                  onClick={() => setFilter(filterOption as any)}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    filter === filterOption
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-400 hover:text-white"
                  }`}
                >
                  {filterOption}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1 bg-gray-700 text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">Date</option>
              <option value="pnl">P&L</option>
            </select>
          </div>
        </div>
      </div>

      {/* Trades Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Symbol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Side
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Entry
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Exit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  P&L
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredTrades.map((trade) => (
                <tr
                  key={trade.id}
                  className="hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {format(parseISO(trade.entry_date), "MMM dd, yyyy")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                    {trade.symbol}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    ${trade.entry_price}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {trade.exit_price ? `$${trade.exit_price}` : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {trade.quantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {trade.pnl !== undefined && trade.pnl !== null ? (
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    <div className="flex items-center space-x-2">
                      <Link
                        href={`/dashboard/trades/edit/${trade.id}`}
                        className="text-gray-400 hover:text-white"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(trade.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredTrades.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">No trades found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
