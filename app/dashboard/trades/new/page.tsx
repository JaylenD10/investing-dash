"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const tradeSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  side: z.enum(["LONG", "SHORT"]),
  entry_date: z.string().min(1, "Entry date is required"),
  entry_price: z.number().positive("Entry price must be positive"),
  quantity: z.number().int().positive("Quantity must be positive"),
  commission: z.number().min(0, "Commission must be non-negative").optional(),
  notes: z.string().optional(),
  // For closed trades
  exit_date: z.string().optional(),
  exit_price: z.number().positive("Exit price must be positive").optional(),
});

type TradeFormData = z.infer<typeof tradeSchema>;

export default function NewTradePage() {
  const [loading, setLoading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<"OPEN" | "CLOSED">("CLOSED");
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<TradeFormData>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      side: "LONG",
      commission: 0,
    },
  });

  const watchSide = watch("side");
  const watchEntryPrice = watch("entry_price");
  const watchExitPrice = watch("exit_price");
  const watchQuantity = watch("quantity");

  const calculatePnL = () => {
    if (!watchEntryPrice || !watchExitPrice || !watchQuantity) return 0;

    const priceDiff =
      watchSide === "LONG"
        ? watchExitPrice - watchEntryPrice
        : watchEntryPrice - watchExitPrice;

    return priceDiff * watchQuantity;
  };

  const calculatePercentageGain = () => {
    if (!watchEntryPrice || !watchExitPrice) return 0;

    const percentage =
      watchSide === "LONG"
        ? ((watchExitPrice - watchEntryPrice) / watchEntryPrice) * 100
        : ((watchEntryPrice - watchExitPrice) / watchEntryPrice) * 100;

    return percentage;
  };

  const onSubmit = async (data: TradeFormData) => {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const tradeData = {
        user_id: user.id,
        symbol: data.symbol.toUpperCase(),
        side: data.side,
        entry_date: data.entry_date,
        entry_price: data.entry_price,
        quantity: data.quantity,
        commission: data.commission || 0,
        notes: data.notes || "",
        status: tradeStatus,
        ...(tradeStatus === "CLOSED" && {
          exit_date: data.exit_date,
          exit_price: data.exit_price,
          pnl: calculatePnL() - (data.commission || 0),
          percentage_gain: calculatePercentageGain(),
        }),
      };

      const { error } = await supabase.from("trades").insert([tradeData]);

      if (error) throw error;

      // Update daily stats
      if (tradeStatus === "CLOSED" && data.exit_date) {
        await updateDailyStats(
          user.id,
          data.exit_date,
          calculatePnL() - (data.commission || 0)
        );
      }

      router.push("/dashboard/trades");
      router.refresh();
    } catch (error) {
      console.error("Error adding trade:", error);
      alert("Error adding trade. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateDailyStats = async (
    userId: string,
    date: string,
    pnl: number
  ) => {
    const statsDate = date.split("T")[0]; // Get just the date part

    const { data: existingStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("user_id", userId)
      .eq("date", statsDate)
      .single();

    if (existingStats) {
      // Update existing stats
      const newTotalTrades = existingStats.total_trades + 1;
      const newWinningTrades =
        pnl > 0
          ? existingStats.winning_trades + 1
          : existingStats.winning_trades;
      const newLosingTrades =
        pnl < 0 ? existingStats.losing_trades + 1 : existingStats.losing_trades;
      const newTotalPnl = existingStats.total_pnl + pnl;
      const newWinRate =
        newTotalTrades > 0 ? (newWinningTrades / newTotalTrades) * 100 : 0;

      await supabase
        .from("daily_stats")
        .update({
          total_trades: newTotalTrades,
          winning_trades: newWinningTrades,
          losing_trades: newLosingTrades,
          total_pnl: newTotalPnl,
          win_rate: newWinRate,
        })
        .eq("id", existingStats.id);
    } else {
      // Create new daily stats
      await supabase.from("daily_stats").insert([
        {
          user_id: userId,
          date: statsDate,
          total_trades: 1,
          winning_trades: pnl > 0 ? 1 : 0,
          losing_trades: pnl < 0 ? 1 : 0,
          total_pnl: pnl,
          win_rate: pnl > 0 ? 100 : 0,
        },
      ]);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        {/* <Link
          href="/dashboard/trades"
          className="inline-flex items-center text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Trades
        </Link> */}
        <button
          className="inline-flex items-center text-gray-400 hover:text-white mb-4"
          onClick={handleGoBack}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Previous
        </button>
        <h1 className="text-3xl font-bold text-white">Add New Trade</h1>
        <p className="text-gray-400 mt-2">Record your trading activity</p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Trade Status Toggle */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Trade Status
            </label>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setTradeStatus("OPEN")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  tradeStatus === "OPEN"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                Open Trade
              </button>
              <button
                type="button"
                onClick={() => setTradeStatus("CLOSED")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  tradeStatus === "CLOSED"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                Closed Trade
              </button>
            </div>
          </div>

          {/* Symbol and Side */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Symbol
              </label>
              <input
                type="text"
                {...register("symbol")}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="e.g., ES, NQ"
              />
              {errors.symbol && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.symbol.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Side
              </label>
              <select
                {...register("side")}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="LONG">Long</option>
                <option value="SHORT">Short</option>
              </select>
            </div>
          </div>

          {/* Entry Details */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Entry Date & Time
              </label>
              <input
                type="datetime-local"
                {...register("entry_date")}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {errors.entry_date && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.entry_date.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Entry Price
              </label>
              <input
                type="number"
                step="0.01"
                {...register("entry_price", { valueAsNumber: true })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="0.00"
              />
              {errors.entry_price && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.entry_price.message}
                </p>
              )}
            </div>
          </div>

          {/* Exit Details (for closed trades) */}
          {tradeStatus === "CLOSED" && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Exit Date & Time
                </label>
                <input
                  type="datetime-local"
                  {...register("exit_date")}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Exit Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register("exit_price", { valueAsNumber: true })}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          {/* Quantity and Commission */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Quantity (Contracts)
              </label>
              <input
                type="number"
                {...register("quantity", { valueAsNumber: true })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="1"
              />
              {errors.quantity && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.quantity.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Commission
              </label>
              <input
                type="number"
                step="0.01"
                {...register("commission", { valueAsNumber: true })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Notes
            </label>
            <textarea
              {...register("notes")}
              rows={4}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Any additional notes about this trade..."
            />
          </div>

          {/* P&L Preview for closed trades */}
          {tradeStatus === "CLOSED" &&
            watchEntryPrice &&
            watchExitPrice &&
            watchQuantity && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-white font-medium mb-2">Trade Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gross P&L:</span>
                    <span
                      className={`font-medium ${
                        calculatePnL() >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      ${calculatePnL().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Percentage:</span>
                    <span
                      className={`font-medium ${
                        calculatePercentageGain() >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {calculatePercentageGain().toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Adding Trade..." : "Add Trade"}
          </button>
        </form>
      </div>
    </div>
  );
}
