"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trade } from "@/types/database";
import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { Plus, Edit2, Trash2, Filter, Save, X, Search } from "lucide-react";
import { calculateFuturesPnL } from "@/lib/futures-specs";

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [sortBy, setSortBy] = useState<"date" | "pnl" | "symbol">("date");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedTrade, setEditedTrade] = useState<Partial<Trade>>({});
  const supabase = createClient();

  useEffect(() => {
    fetchTrades();
  }, []);

  useEffect(() => {
    filterAndSortTrades();
  }, [trades, filter, sortBy, searchSymbol]);

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

    if (filter !== "ALL") {
      filtered = filtered.filter((trade) => trade.status === filter);
    }

    // Apply symbol search
    if (searchSymbol.trim()) {
      filtered = filtered.filter((trade) =>
        trade.symbol.toLowerCase().includes(searchSymbol.toLowerCase())
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === "date") {
        return (
          new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
        );
      } else if (sortBy === "pnl") {
        return (b.pnl || 0) - (a.pnl || 0);
      } else if (sortBy === "symbol") {
        return a.symbol.localeCompare(b.symbol);
      }
      return 0;
    });

    setFilteredTrades(filtered);
  };

  const handleEdit = (trade: Trade) => {
    setEditingId(trade.id);
    setEditedTrade({
      symbol: trade.symbol,
      side: trade.side,
      entry_date: trade.entry_date,
      exit_date: trade.exit_date,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price,
      quantity: trade.quantity,
      commission: trade.commission,
      notes: trade.notes,
      status: trade.status,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditedTrade({});
  };

  const calculatePnL = (trade: Partial<Trade>) => {
    if (
      !trade.entry_price ||
      !trade.exit_price ||
      !trade.quantity ||
      !trade.symbol
    )
      return 0;

    const grossPnL = calculateFuturesPnL(
      trade.symbol,
      trade.entry_price,
      trade.exit_price,
      trade.quantity,
      trade.side!
    );

    return grossPnL - (trade.commission || 0);
  };

  const calculatePercentageGain = (trade: Partial<Trade>) => {
    if (!trade.entry_price || !trade.exit_price) return 0;

    const percentage =
      trade.side === "LONG"
        ? ((trade.exit_price - trade.entry_price) / trade.entry_price) * 100
        : ((trade.entry_price - trade.exit_price) / trade.entry_price) * 100;

    return percentage;
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    try {
      // Get the original trade before updating
      const originalTrade = trades.find((t) => t.id === editingId);
      if (!originalTrade) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate P&L values
      const pnl =
        editedTrade.status === "CLOSED" ? calculatePnL(editedTrade) : null;
      const percentage_gain =
        editedTrade.status === "CLOSED"
          ? calculatePercentageGain(editedTrade)
          : null;

      const updatedTrade = {
        ...editedTrade,
        pnl,
        percentage_gain,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("trades")
        .update(updatedTrade)
        .eq("id", editingId)
        .select()
        .single();

      if (error) throw error;

      // Update local state with the returned data
      if (data) {
        setTrades(
          trades.map((trade) => (trade.id === editingId ? data : trade))
        );
      }

      // Handle daily stats updates
      // If the original trade was closed, recalculate stats for its date
      if (originalTrade.status === "CLOSED" && originalTrade.exit_date) {
        await recalculateDailyStats(user.id, originalTrade.exit_date);
      }

      // If the updated trade is closed, recalculate stats for its date
      if (updatedTrade.status === "CLOSED" && editedTrade.exit_date) {
        // Only recalculate if it's a different date
        if (originalTrade.exit_date !== editedTrade.exit_date) {
          await recalculateDailyStats(user.id, editedTrade.exit_date);
        }
      }

      setEditingId(null);
      setEditedTrade({});
    } catch (error) {
      console.error("Error updating trade:", error);
      alert("Error updating trade");
    }
  };

  const recalculateDailyStats = async (userId: string, date: string) => {
    const statsDate = date.split("T")[0];

    // Fetch all trades for that day
    const { data: dayTrades } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "CLOSED")
      .gte("exit_date", `${statsDate}T00:00:00`)
      .lt("exit_date", `${statsDate}T23:59:59`);

    if (dayTrades && dayTrades.length > 0) {
      // Calculate stats for the day
      const totalTrades = dayTrades.length;
      const winningTrades = dayTrades.filter((t) => t.pnl && t.pnl > 0).length;
      const losingTrades = dayTrades.filter((t) => t.pnl && t.pnl < 0).length;
      const totalPnl = dayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

      // Update or insert the daily stats
      await supabase.from("daily_stats").upsert(
        {
          user_id: userId,
          date: statsDate,
          total_trades: totalTrades,
          winning_trades: winningTrades,
          losing_trades: losingTrades,
          total_pnl: totalPnl,
          win_rate: winRate,
        },
        {
          onConflict: "user_id,date",
        }
      );
    } else {
      // No trades for this day, delete the daily stats entry
      await supabase
        .from("daily_stats")
        .delete()
        .eq("user_id", userId)
        .eq("date", statsDate);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trade?")) return;

    try {
      // Get the trade before deleting
      const tradeToDelete = trades.find((t) => t.id === id);
      if (!tradeToDelete) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("trades").delete().eq("id", id);

      if (error) throw error;

      // Update local state
      setTrades(trades.filter((trade) => trade.id !== id));

      // If the deleted trade was closed, recalculate stats for that day
      if (tradeToDelete.status === "CLOSED" && tradeToDelete.exit_date) {
        await recalculateDailyStats(user.id, tradeToDelete.exit_date);
      }
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
          {/* Symbol Search */}
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              placeholder="Search symbol"
              className="px-3 py-1 bg-neutral-800 text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-white placeholder-neutral-500"
            />
          </div>

          {/* Status Filter */}
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

          {/* Sort By */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1 bg-gray-700 text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">Date</option>
              <option value="pnl">P&L</option>
              <option value="symbol">Symbol</option>
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
              {filteredTrades.map((trade) => {
                const isEditing = editingId === trade.id;

                return (
                  <tr
                    key={trade.id}
                    className="hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {isEditing ? (
                        <input
                          type="datetime-local"
                          value={editedTrade.entry_date?.slice(0, 16)}
                          onChange={(e) =>
                            setEditedTrade({
                              ...editedTrade,
                              entry_date: e.target.value,
                            })
                          }
                          className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        formatInTimeZone(
                          parseISO(trade.entry_date),
                          Intl.DateTimeFormat().resolvedOptions().timeZone,
                          "MMM dd, yyyy"
                        )
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedTrade.symbol}
                          onChange={(e) =>
                            setEditedTrade({
                              ...editedTrade,
                              symbol: e.target.value.toUpperCase(),
                            })
                          }
                          className="bg-gray-700 text-white rounded px-2 py-1 w-20 text-sm"
                        />
                      ) : (
                        trade.symbol
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {isEditing ? (
                        <select
                          value={editedTrade.side}
                          onChange={(e) =>
                            setEditedTrade({
                              ...editedTrade,
                              side: e.target.value as "LONG" | "SHORT",
                            })
                          }
                          className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
                        >
                          <option value="LONG">LONG</option>
                          <option value="SHORT">SHORT</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            trade.side === "LONG"
                              ? "bg-green-500/10 text-green-500"
                              : "bg-red-500/10 text-red-500"
                          }`}
                        >
                          {trade.side}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editedTrade.entry_price}
                          onChange={(e) =>
                            setEditedTrade({
                              ...editedTrade,
                              entry_price: parseFloat(e.target.value),
                            })
                          }
                          className="bg-gray-700 text-white rounded px-2 py-1 w-24 text-sm"
                        />
                      ) : (
                        `$${trade.entry_price}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editedTrade.exit_price || ""}
                          onChange={(e) =>
                            setEditedTrade({
                              ...editedTrade,
                              exit_price: e.target.value
                                ? parseFloat(e.target.value)
                                : undefined,
                            })
                          }
                          className="bg-gray-700 text-white rounded px-2 py-1 w-24 text-sm"
                          placeholder="-"
                        />
                      ) : trade.exit_price ? (
                        `$${trade.exit_price}`
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editedTrade.quantity}
                          onChange={(e) =>
                            setEditedTrade({
                              ...editedTrade,
                              quantity: parseInt(e.target.value),
                            })
                          }
                          className="bg-gray-700 text-white rounded px-2 py-1 w-16 text-sm"
                        />
                      ) : (
                        trade.quantity
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {isEditing &&
                      editedTrade.status === "CLOSED" &&
                      editedTrade.entry_price &&
                      editedTrade.exit_price ? (
                        <span
                          className={
                            calculatePnL(editedTrade) >= 0
                              ? "text-green-500"
                              : "text-red-500"
                          }
                        >
                          ${calculatePnL(editedTrade).toFixed(2)}
                        </span>
                      ) : trade.pnl !== undefined && trade.pnl !== null ? (
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
                      {isEditing ? (
                        <select
                          value={editedTrade.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as
                              | "OPEN"
                              | "CLOSED";
                            setEditedTrade({
                              ...editedTrade,
                              status: newStatus,
                              exit_date:
                                newStatus === "OPEN"
                                  ? undefined
                                  : editedTrade.exit_date,
                              exit_price:
                                newStatus === "OPEN"
                                  ? undefined
                                  : editedTrade.exit_price,
                            });
                          }}
                          className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="CLOSED">CLOSED</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            trade.status === "OPEN"
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-gray-500/10 text-gray-400"
                          }`}
                        >
                          {trade.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      <div className="flex items-center space-x-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={handleSaveEdit}
                              className="text-green-500 hover:text-green-400"
                              title="Save"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="text-gray-400 hover:text-white"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEdit(trade)}
                              className="text-gray-400 hover:text-white"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(trade.id)}
                              className="text-gray-400 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredTrades.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">No trades found</p>
            </div>
          )}
        </div>
      </div>

      {/* Notes Section for Editing */}
      {editingId && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Edit Trade Details
          </h3>
          <div className="space-y-4">
            {editedTrade.status === "CLOSED" && (
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Exit Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={editedTrade.exit_date?.slice(0, 16) || ""}
                  onChange={(e) =>
                    setEditedTrade({
                      ...editedTrade,
                      exit_date: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Commission
              </label>
              <input
                type="number"
                step="0.01"
                value={editedTrade.commission || ""}
                onChange={(e) =>
                  setEditedTrade({
                    ...editedTrade,
                    commission: e.target.value ? parseFloat(e.target.value) : 0,
                  })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Notes
              </label>
              <textarea
                value={editedTrade.notes || ""}
                onChange={(e) =>
                  setEditedTrade({ ...editedTrade, notes: e.target.value })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                rows={3}
                placeholder="Add any notes about this trade..."
              />
            </div>

            {editedTrade.status === "CLOSED" &&
              editedTrade.entry_price &&
              editedTrade.exit_price &&
              editedTrade.quantity && (
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-white font-medium mb-2">Trade Summary</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Gross P&L:</p>
                      <p
                        className={`font-medium ${
                          calculatePnL(editedTrade) >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        ${calculatePnL(editedTrade).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Percentage:</p>
                      <p
                        className={`font-medium ${
                          calculatePercentageGain(editedTrade) >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {calculatePercentageGain(editedTrade).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
