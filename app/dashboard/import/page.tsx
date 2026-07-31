"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, FileText, AlertCircle, Check } from "lucide-react";
import Papa from "papaparse";
import { format, isValid, parse } from "date-fns";
import { calculateFuturesPnL } from "@/lib/futures-specs";
import { useRouter } from "next/navigation";

interface AmpCsvRow {
  DATE: string;
  "TRADE NUMBER": string;
  MARKET: string;
  BUY: string;
  SELL: string;
  "CONTRACT DESCRIPTION": string;
  "TRADE PRICE": string;
  CCY: string;
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

interface OpenLot {
  contractKey: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  price: number;
  time: string;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
    ? error
    : "An unknown error occurred";

const extractSymbol = (contractDescription: string): string => {
  const symbol = contractDescription.trim().split(/\s+/)[0]?.toUpperCase();
  return symbol || contractDescription;
};

const parseAmpDate = (value: string): string | null => {
  const parsed = parse(value.trim(), "dd-MMM-yy", new Date());
  return isValid(parsed) ? format(parsed, "yyyy-MM-dd'T'00:00:00") : null;
};

const withDefaultExecutionTime = (
  dateAtMidnight: string,
  sequence: number
): string => {
  const timestamp = new Date(dateAtMidnight);
  timestamp.setHours(7, sequence * 10, 0, 0);
  return format(timestamp, "yyyy-MM-dd'T'HH:mm:ss");
};

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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "text/csv" && !file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }
    setSelectedFile(file);
    setError(null);
    setParsedTrades([]);
    setImportStatus("idle");
  };

  const parseCSVData = async () => {
    if (!selectedFile) return;
    setImportStatus("parsing");
    setParsing(true);
    setError(null);

    try {
      const text = await selectedFile.text();
      Papa.parse<AmpCsvRow>(text, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (header) => header.trim().toUpperCase(),
        complete: (results) => {
          try {
            const requiredHeaders = [
              "DATE",
              "TRADE NUMBER",
              "BUY",
              "SELL",
              "CONTRACT DESCRIPTION",
              "TRADE PRICE",
            ];
            const headers = results.meta.fields ?? [];
            const missingHeaders = requiredHeaders.filter(
              (header) => !headers.includes(header)
            );
            if (missingHeaders.length > 0)
              throw new Error(
                `This does not look like an AMP broker statement. Missing: ${missingHeaders.join(
                  ", "
                )}`
              );

            const rows = results.data
              .filter(
                (row) =>
                  row.DATE &&
                  row["CONTRACT DESCRIPTION"] &&
                  row["TRADE PRICE"] &&
                  (row.BUY || row.SELL)
              )
              .reverse();
            const openLots: OpenLot[] = [];
            const trades: ParsedTrade[] = [];
            const executionsPerDate = new Map<string, number>();
            let skippedRows = 0;

            for (const row of rows) {
              const quantity = Number(row.BUY || row.SELL);
              const price = Number(row["TRADE PRICE"]);
              const dateAtMidnight = parseAmpDate(row.DATE);
              if (
                !Number.isFinite(quantity) ||
                quantity <= 0 ||
                !Number.isFinite(price) ||
                !dateAtMidnight
              ) {
                skippedRows += 1;
                continue;
              }
              const sequence = executionsPerDate.get(dateAtMidnight) ?? 0;
              const time = withDefaultExecutionTime(dateAtMidnight, sequence);
              executionsPerDate.set(dateAtMidnight, sequence + 1);

              const side: "LONG" | "SHORT" = row.BUY ? "LONG" : "SHORT";
              const contractKey = row["CONTRACT DESCRIPTION"]
                .trim()
                .toUpperCase();
              const symbol = extractSymbol(row["CONTRACT DESCRIPTION"]);
              let remaining = quantity;

              // Close the oldest open lot for this exact contract first. The
              // matched quantity is the lower of the entry and exit quantities,
              // so a 2-lot exit against two 1-lot entries creates two trades,
              // each with its own entry price and the shared exit price.
              for (let index = 0; index < openLots.length && remaining > 0; ) {
                const lot = openLots[index];
                if (lot.contractKey !== contractKey || lot.side === side) {
                  index += 1;
                  continue;
                }
                const matchedQuantity = Math.min(remaining, lot.quantity);
                trades.push({
                  symbol: lot.symbol,
                  side: lot.side,
                  entryPrice: lot.price,
                  exitPrice: price,
                  quantity: matchedQuantity,
                  entryTime: lot.time,
                  exitTime: time,
                  commission: 0,
                  pnl: calculateFuturesPnL(
                    lot.symbol,
                    lot.price,
                    price,
                    matchedQuantity,
                    lot.side
                  ),
                });
                lot.quantity -= matchedQuantity;
                remaining -= matchedQuantity;
                if (lot.quantity === 0) openLots.splice(index, 1);
                else index += 1;
              }

              if (remaining > 0)
                openLots.push({
                  contractKey,
                  symbol,
                  side,
                  quantity: remaining,
                  price,
                  time,
                });
            }

            setParsedTrades(trades);
            setImportStatus("idle");
            if (trades.length === 0)
              setError(
                "No closed trades were found. Open positions are not imported."
              );
            else if (skippedRows > 0)
              setError(
                `${skippedRows} invalid row${
                  skippedRows === 1 ? " was" : "s were"
                } skipped.`
              );
          } catch (parseError) {
            setError(getErrorMessage(parseError));
            setImportStatus("error");
          } finally {
            setParsing(false);
          }
        },
        error: (parseError: Error) => {
          setError(`CSV parsing error: ${getErrorMessage(parseError)}`);
          setImportStatus("error");
          setParsing(false);
        },
      });
    } catch (readError) {
      setError(`Error reading file: ${getErrorMessage(readError)}`);
      setImportStatus("error");
      setParsing(false);
    }
  };

  const updateDailyStats = async (
    userId: string,
    date: string,
    pnl: number
  ) => {
    const statsDate = date.slice(0, 10);
    const { data: existingStats, error: findError } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("user_id", userId)
      .eq("date", statsDate)
      .maybeSingle();
    if (findError) throw findError;
    if (existingStats) {
      const totalTrades = existingStats.total_trades + 1;
      const winningTrades = existingStats.winning_trades + (pnl > 0 ? 1 : 0);
      const losingTrades = existingStats.losing_trades + (pnl < 0 ? 1 : 0);
      const { error: updateError } = await supabase
        .from("daily_stats")
        .update({
          total_trades: totalTrades,
          winning_trades: winningTrades,
          losing_trades: losingTrades,
          total_pnl: existingStats.total_pnl + pnl,
          win_rate: (winningTrades / totalTrades) * 100,
        })
        .eq("id", existingStats.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from("daily_stats").insert({
        user_id: userId,
        date: statsDate,
        total_trades: 1,
        winning_trades: pnl > 0 ? 1 : 0,
        losing_trades: pnl < 0 ? 1 : 0,
        total_pnl: pnl,
        win_rate: pnl > 0 ? 100 : 0,
      });
      if (insertError) throw insertError;
    }
  };

  const importTrades = async () => {
    if (!parsedTrades.length) return;
    setImportStatus("importing");
    setImportProgress({ current: 0, total: parsedTrades.length * 2 });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const now = new Date().toISOString();
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
          ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) *
          (trade.side === "LONG" ? 100 : -100),
        status: "CLOSED" as const,
        notes: "Imported from AMP Futures",
        created_at: now,
        updated_at: now,
      }));
      for (let index = 0; index < tradesToInsert.length; index += 10) {
        const { error: insertError } = await supabase
          .from("trades")
          .insert(tradesToInsert.slice(index, index + 10));
        if (insertError) throw insertError;
        setImportProgress({
          current: Math.min(index + 10, parsedTrades.length),
          total: parsedTrades.length * 2,
        });
      }
      for (let index = 0; index < parsedTrades.length; index += 1) {
        await updateDailyStats(
          user.id,
          parsedTrades[index].exitTime,
          parsedTrades[index].pnl
        );
        setImportProgress({
          current: parsedTrades.length + index + 1,
          total: parsedTrades.length * 2,
        });
      }
      setImportStatus("success");
      setTimeout(() => router.push("/dashboard/trades"), 2000);
    } catch (importError) {
      setError(`Error importing trades: ${getErrorMessage(importError)}`);
      setImportStatus("error");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Import AMP Trades</h1>
        <p className="text-neutral-400 mt-2">
          Import an AMP broker statement CSV.
        </p>
      </div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Upload CSV File
        </h2>
        <div className="border-2 border-dashed border-neutral-700 rounded-lg p-8 text-center">
          <FileText className="w-12 h-12 text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-300 mb-4">
            {selectedFile
              ? selectedFile.name
              : "Choose your AMP broker statement CSV"}
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
            className="inline-flex items-center px-4 py-2 bg-white text-black font-medium rounded-lg cursor-pointer"
          >
            <Upload className="w-4 h-4 mr-2" />
            Select CSV File
          </label>
        </div>
        {selectedFile && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={parseCSVData}
              disabled={parsing || importStatus === "importing"}
              className="px-4 py-2 bg-white text-black font-medium rounded-lg"
            >
              {parsing ? "Parsing..." : "Parse CSV"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {parsedTrades.length > 0 && importStatus !== "success" && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Found {parsedTrades.length} closed trade
              {parsedTrades.length === 1 ? "" : "s"}
            </h2>
            <button
              onClick={importTrades}
              disabled={importStatus === "importing"}
              className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg"
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
                  {[
                    "Symbol",
                    "Side",
                    "Entry",
                    "Exit",
                    "Qty",
                    "P&L",
                    "Date",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-4 py-3 text-left text-xs font-medium text-neutral-400 uppercase"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedTrades.map((trade, index) => (
                  <tr key={index} className="border-t border-neutral-700">
                    <td className="px-4 py-3 text-white">{trade.symbol}</td>
                    <td className="px-4 py-3 text-neutral-300">{trade.side}</td>
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
                      className={`px-4 py-3 ${
                        trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      ${trade.pnl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {format(new Date(trade.exitTime), "MMM dd, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {importStatus === "success" && (
        <div className="bg-green-500/10 border border-green-500 rounded-lg p-6 text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-green-500">
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
          How to Export from AMP
        </h3>
        <ol className="text-neutral-300 text-sm space-y-2 list-decimal list-inside">
          <li>Download the PDF client statement</li>
          <li>Take a screenshot of the Purchase & Sale</li>
          <li>Import to AI & reformat to use commas</li>
          <li>Remove DEBIT/CREDIT column and TOTAL rows</li>
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
