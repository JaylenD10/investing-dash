"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import {
  calculateFuturesPnL,
  getContractSpecs,
  FuturesContract,
} from "@/lib/futures-specs";

const tradeSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  side: z.enum(["LONG", "SHORT"]),
  entry_date: z.string().min(1, "Entry date is required"),
  entry_price: z.number().positive("Entry price must be positive"),
  quantity: z.number().int().positive("Quantity must be positive"),
  commission: z.number().min(0, "Commission must be non-negative").optional(),
  notes: z.string().optional(),
  exit_date: z.string().optional(),
  exit_price: z.number().positive("Exit price must be positive").optional(),
});

type TradeFormData = z.infer<typeof tradeSchema>;

export default function NewTradePage() {
  const [loading, setLoading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<"OPEN" | "CLOSED">("CLOSED");
  const [contractInfo, setContractInfo] = useState<FuturesContract | null>(
    null
  );
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
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
  const watchSymbol = watch("symbol");

  const calculatePnL = () => {
    if (!watchEntryPrice || !watchExitPrice || !watchQuantity || !watchSymbol)
      return 0;

    const grossPnL = calculateFuturesPnL(
      watchSymbol,
      watchEntryPrice,
      watchExitPrice,
      watchQuantity,
      watchSide
    );

    return grossPnL - (watch("commission") || 0);
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

      const localEntryDate = new Date(data.entry_date).toISOString();
      const localExitDate = data.exit_date
        ? new Date(data.exit_date).toISOString()
        : undefined;

      const tradeData = {
        ...data,
        user_id: user.id,
        symbol: data.symbol.toUpperCase(),
        side: data.side,
        entry_date: localEntryDate,
        entry_price: data.entry_price,
        quantity: data.quantity,
        commission: data.commission || 0,
        notes: data.notes || "",
        status: tradeStatus,
        ...(tradeStatus === "CLOSED" && {
          exit_date: localExitDate,
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

  const getPriceStep = (symbol: string) => {
    if (
      symbol.includes("6") ||
      symbol.includes("/") ||
      ["EUR", "GBP", "JPY", "AUD"].some((curr) => symbol.includes(curr))
    ) {
      return "0.00001";
    }
    return "0.01";
  };

  const handleGoBack = () => {
    router.back();
  };

  useEffect(() => {
    if (watchSymbol) {
      const specs = getContractSpecs(watchSymbol);
      setContractInfo(specs);
    }
  }, [watchSymbol]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          className="inline-flex items-center text-gray-400 hover:text-white mb-4"
          onClick={handleGoBack}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Previous
        </button>
        <h1 className="text-3xl font-bold text-white">Add New Trade</h1>
        <p className="text-gray-400 mt-2">Record your trading activity</p>
        {contractInfo && (
          <div className="bg-neutral-800 rounded-lg p-4 mt-4">
            <h4 className="text-white font-medium mb-2">
              Contract Specifications
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-neutral-400">Contract:</div>
              <div className="text-white">{contractInfo.name}</div>
              <div className="text-neutral-400">Point Value:</div>
              <div className="text-white">${contractInfo.pointValue}</div>
              <div className="text-neutral-400">Tick Size:</div>
              <div className="text-white">{contractInfo.tickSize}</div>
              <div className="text-neutral-400">Tick Value:</div>
              <div className="text-white">${contractInfo.tickValue}</div>
            </div>
          </div>
        )}
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
                list="futures-symbols"
                onChange={(e) => {
                  const specs = getContractSpecs(e.target.value);
                  setContractInfo(specs);
                }}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="e.g., ES, NQ"
              />
              <datalist id="futures-symbols">
                <option value="ES">ES - E-mini S&P 500</option>
                <option value="MES">MES - Micro E-mini S&P</option>
                <option value="NQ">NQ - E-mini Nasdaq</option>
                <option value="MNQ">MNQ - Micro E-mini Nasdaq</option>
                <option value="RTY">RTY - E-mini Russell</option>
                <option value="M2K">M2K - Micro E-mini Russell</option>
                <option value="YM">YM - E-mini Dow</option>
                <option value="GC">GC - Gold</option>
                <option value="MGC">MGC - Micro Gold</option>
                <option value="CL">CL - Crude Oil</option>
                <option value="MCL">MCL - Micro Crude Oil</option>
                <option value="NG">NG - Natural Gas</option>
                <option value="6E">6E - Euro FX</option>
                <option value="M6E">M6E - Micro Euro FX</option>
                <option value="ZN">ZN - 10-Year T-Note</option>
                <option value="ZB">ZB - 30-Year T-Bond</option>
              </datalist>
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

          {/* Price Details */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Entry Price
              </label>
              <input
                type="number"
                step={getPriceStep(watch("symbol") || "")}
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

            {tradeStatus === "CLOSED" && (
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
            )}
          </div>

          {/* Date Details */}
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
            {tradeStatus === "CLOSED" && (
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
            )}
          </div>

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
                Commission & Fees
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
