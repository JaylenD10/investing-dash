"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, FileText, AlertCircle, Check } from "lucide-react";
import Papa from "papaparse";
import { format } from "date-fns";
import { calculateFuturesPnL } from "@/lib/futures-specs";
import { useRouter } from "next/navigation";

interface CSVRow {
  Symbol: string;
  Side: string;
  Type: string;
  Qty: string;
  "Limit Price": string;
  "Stop Price": string;
  "Active At": string;
  "Fill Qty": string;
  "Avg Fill Price": string;
  Commission: string;
  "Placing Time": string;
  Status: string;
  "Status Time": string;
  "Order ID": string;
  Duration: string;
}

interface ParsedTrade {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  entryTime: string;
  exitTime: string;
  commission: number;
  pnl: number;
}

export default function ImportPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedTrades, setParsedTrades] = useState<ParsedTrade[]>([]);
  const [importStatus, setImportStatus] = useState<
    "idle" | "parsing" | "importing" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
  });
  const supabase = createClient();
  const router = useRouter();

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "An unknown error occurred";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setSelectedFile(file);
        setError(null);
        setParsedTrades([]);
        setImportStatus("idle");
      } else {
        setError("Please select a CSV file");
      }
    }
  };

  const extractSymbol = (fullSymbol: string): string => {
    // Extract the contract code from format like "F.US.MGCZ25"
    const parts = fullSymbol.split(".");
    if (parts.length >= 3) {
      const contract = parts[parts.length - 1];
      // Map to standard symbols
      if (contract.startsWith("MGC")) return "MGC"; // Micro Gold
      if (contract.startsWith("MES")) return "MES"; // Micro E-mini S&P
      if (contract.startsWith("MNQ")) return "MNQ"; // Micro E-mini Nasdaq
      if (contract.startsWith("ES")) return "ES"; // E-mini S&P
      if (contract.startsWith("NQ")) return "NQ"; // E-mini Nasdaq
      if (contract.startsWith("CL")) return "CL"; // Crude Oil
      if (contract.startsWith("GC")) return "GC"; // Gold
      // Add more mappings as needed
    }
    return fullSymbol;
  };

  const parseCSVData = async () => {
    if (!selectedFile) return;

    setImportStatus("parsing");
    setParsing(true);
    setError(null);

    try {
      const text = await selectedFile.text();

      Papa.parse<CSVRow>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            // Filter only filled market orders
            const filledOrders = results.data.filter(
              (row) =>
                row.Status === "Filled" &&
                (row.Type === "Market" || row.Type === "Stop") &&
                row["Avg Fill Price"]
            );

            // Sort by time
            filledOrders.sort(
              (a, b) =>
                new Date(a["Status Time"]).getTime() -
                new Date(b["Status Time"]).getTime()
            );

            // Match trades (Buy -> Sell)
            const trades: ParsedTrade[] = [];
            const openPositions: typeof filledOrders = [];

            filledOrders.forEach((order) => {
              const symbol = extractSymbol(order.Symbol);
              const quantity = parseInt(order["Fill Qty"] || order.Qty);
              const price = parseFloat(order["Avg Fill Price"]);
              const time = order["Status Time"];

              if (order.Side === "Buy") {
                openPositions.push(order);
              } else if (order.Side === "Sell") {
                // Find matching buy order
                const matchIndex = openPositions.findIndex(
                  (buy) =>
                    extractSymbol(buy.Symbol) === symbol &&
                    parseInt(buy["Fill Qty"] || buy.Qty) === quantity
                );

                if (matchIndex !== -1) {
                  const buyOrder = openPositions[matchIndex];
                  const entryPrice = parseFloat(buyOrder["Avg Fill Price"]);
                  const exitPrice = price;

                  // Calculate P&L
                  const pnl = calculateFuturesPnL(
                    symbol,
                    entryPrice,
                    exitPrice,
                    quantity,
                    "LONG"
                  );

                  trades.push({
                    symbol,
                    side: "LONG",
                    entryPrice,
                    exitPrice,
                    quantity,
                    entryTime: buyOrder["Status Time"],
                    exitTime: time,
                    commission: 0, // TradingView CSV doesn't include commission
                    pnl,
                  });

                  // Remove matched position
                  openPositions.splice(matchIndex, 1);
                } else {
                  // This might be a short trade or unmatched sell
                  console.warn("Unmatched sell order:", order);
                }
              }
            });

            setParsedTrades(trades);
            setImportStatus("idle");
          } catch (err) {
            console.error("Error processing data:", err);
            setError("Error processing CSV data");
            setImportStatus("error");
          }
        },
        error: (err: unknown) => {
          setError(`CSV parsing error: ${getErrorMessage(err)}`);
          setImportStatus("error");
        },
      });
    } catch {
      setError("Error reading file");
      setImportStatus("error");
    } finally {
      setParsing(false);
    }
  };

  const importTrades = async () => {
    if (parsedTrades.length === 0) return;

    setImportStatus("importing");
    setImportProgress({ current: 0, total: parsedTrades.length });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const tradesToInsert = parsedTrades.map((trade) => ({
        user_id: user.id,
        symbol: trade.symbol,
        side: trade.side,
        entry_date: trade.entryTime,
        exit_date: trade.exitTime,
        entry_price: trade.entryPrice,
        exit_price: trade.exitPrice,
        quantity: trade.quantity,
        commission: trade.commission,
        pnl: trade.pnl,
        percentage_gain:
          ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100,
        status: "CLOSED" as const,
        notes: "Imported from TradingView",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Insert trades in batches
      const batchSize = 10;
      for (let i = 0; i < tradesToInsert.length; i += batchSize) {
        const batch = tradesToInsert.slice(i, i + batchSize);

        const { error } = await supabase.from("trades").insert(batch);

        if (error) throw error;

        setImportProgress({
          current: Math.min(i + batchSize, tradesToInsert.length),
          total: tradesToInsert.length,
        });
      }

      // Update daily stats for each unique date
      for (let i = 0; i < parsedTrades.length; i++) {
        const trade = parsedTrades[i];
        // Update stats for the exit date (when the trade was closed)
        await updateDailyStats(user.id, trade.exitTime, trade.pnl);

        setImportProgress({
          current: parsedTrades.length + i + 1,
          total: parsedTrades.length * 2,
        });
      }

      setImportStatus("success");

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push("/dashboard/trades");
      }, 2000);
    } catch (err) {
      console.error("Import error:", err);

      if (err) {
        setError(getErrorMessage(err) || "Error importing trades");
      }

      setImportStatus("error");
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Import Trades</h1>
        <p className="text-neutral-400 mt-2">
          Import trades from TradingView CSV export
        </p>
      </div>

      {/* File Upload */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Upload CSV File
        </h2>

        <div className="border-2 border-dashed border-neutral-700 rounded-lg p-8 text-center">
          <FileText className="w-12 h-12 text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-300 mb-2">
            {selectedFile
              ? selectedFile.name
              : "Drop your TradingView CSV export here or click to browse"}
          </p>
          <p className="text-neutral-500 text-sm mb-4">
            Export your order history from TradingView as CSV
          </p>
          <input
            type="file"
            id="csv-upload"
            className="hidden"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            disabled={parsing || importStatus === "importing"}
          />
          <label
            htmlFor="csv-upload"
            className="inline-flex items-center px-4 py-2 bg-white hover:bg-neutral-100 text-black font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4 mr-2" />
            Select CSV File
          </label>
        </div>

        {selectedFile && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-neutral-400 text-sm">
              Selected: {selectedFile.name}
            </p>
            <button
              onClick={parseCSVData}
              disabled={parsing || importStatus === "importing"}
              className="px-4 py-2 bg-white hover:bg-neutral-100 text-black font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {parsing ? "Parsing..." : "Parse CSV"}
            </button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 font-medium">Import Error</p>
            <p className="text-red-400 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Parsed Trades Preview */}
      {parsedTrades.length > 0 && importStatus !== "success" && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Found {parsedTrades.length} Trade
              {parsedTrades.length !== 1 ? "s" : ""}
            </h2>
            <button
              onClick={importTrades}
              disabled={importStatus === "importing"}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importStatus === "importing"
                ? `Importing... (${importProgress.current}/${importProgress.total})`
                : "Import All Trades"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Entry
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Exit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    P&L
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Entry Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Exit Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-700">
                {parsedTrades.map((trade, index) => (
                  <tr key={index} className="hover:bg-neutral-800/50">
                    <td className="px-4 py-3 text-white font-medium">
                      {trade.symbol}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      ${trade.entryPrice}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      ${trade.exitPrice}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {trade.quantity}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      ${trade.pnl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {format(new Date(trade.entryTime), "MMM dd HH:mm")}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {format(new Date(trade.exitTime), "MMM dd HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import Summary */}
          <div className="mt-4 p-4 bg-neutral-800 rounded-lg">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-neutral-400">Total P&L</p>
                <p
                  className={`text-lg font-medium ${
                    parsedTrades.reduce((sum, t) => sum + t.pnl, 0) >= 0
                      ? "text-green-500"
                      : "text-red-500"
                  }`}
                >
                  ${parsedTrades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-neutral-400">Winning Trades</p>
                <p className="text-lg font-medium text-green-500">
                  {parsedTrades.filter((t) => t.pnl > 0).length}
                </p>
              </div>
              <div>
                <p className="text-neutral-400">Losing Trades</p>
                <p className="text-lg font-medium text-red-500">
                  {parsedTrades.filter((t) => t.pnl < 0).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {importStatus === "success" && (
        <div className="bg-green-500/10 border border-green-500 rounded-lg p-6 text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-green-500 mb-2">
            Import Successful!
          </h3>
          <p className="text-neutral-400">
            {parsedTrades.length} trade
            {parsedTrades.length !== 1 ? "s have" : " has"} been imported.
          </p>
          <p className="text-neutral-500 text-sm mt-2">
            Redirecting to trades page...
          </p>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
        <h3 className="text-blue-400 font-semibold mb-2">
          How to Export from TradingView
        </h3>
        <ol className="text-neutral-300 text-sm space-y-2 list-decimal list-inside">
          <li>Go to your TradingView account</li>
          <li>Navigate to Trading Panel → History tab</li>
          <li>Click the export icon (download arrow)</li>
          <li>Select &#34;Export to CSV&#34;</li>
          <li>Upload the downloaded CSV file here</li>
        </ol>

        <div className="mt-4 p-3 bg-neutral-800 rounded-lg">
          <p className="text-neutral-400 text-xs">
            <strong>Note:</strong> The importer currently supports:
          </p>
          <ul className="text-neutral-500 text-xs mt-1 list-disc list-inside">
            <li>Market and Stop orders that were filled</li>
            <li>Matching Buy → Sell orders to create complete trades</li>
            <li>Futures contracts (MGC, MES, MNQ, ES, NQ, CL, GC)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
