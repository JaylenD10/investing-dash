"use client";

import { useState } from "react";
import { createWorker } from "tesseract.js";

let pdfjsPromise: Promise<
  typeof import("pdfjs-dist/legacy/build/pdf.mjs")
> | null = null;

function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();

      return pdfjs;
    });
  }

  return pdfjsPromise;
}

const pdfjs = await getPdfJs();

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export type AmpTradeRow = {
  DATE: string;
  "TRADE NUMBER": string;
  MARKET: string;
  BUY: string;
  SELL: string;
  "CONTRACT DESCRIPTION": string;
  "TRADE PRICE": string;
  CCY: string;
};
type SkippedRow = { page: number; line: string; reason: string };

const HEADER =
  "DATE,TRADE NUMBER,MARKET,BUY,SELL,CONTRACT DESCRIPTION,TRADE PRICE,CCY";
const DATE = /^\d{2}-[A-Z]{3}-\d{2}$/;

const normalize = (value: string) =>
  value.replace(/[^A-Z&]/gi, "").toUpperCase();
const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

function parseTradeLine(line: string): { row?: AmpTradeRow; reason?: string } {
  if (!DATE.test(line.slice(0, 9))) return { reason: "Not a trade row" };
  if (
    /\bTOTAL\b|\bEX-\s*\d{2}-[A-Z]{3}-\d{2}\b|\bP&S\b|\b(?:DR|CR)\b/.test(line)
  )
    return { reason: "Summary or debit/credit row" };
  const start = line.match(
    /^(\d{2}-[A-Z]{3}-\d{2})\s+(\d+)\s+([A-Z0-9]+)(\s+)(.*)$/
  );
  if (!start) return { reason: "Missing date, trade number, or market" };
  const [, date, tradeNumber, market, gap, rest] = start;
  const tail = rest.match(
    /^(\d+(?:\.\d+)?)\s+(.+?)\s+(-?[\d,]+(?:\.\d+)?)\s+([A-Z]{3})\s*$/
  );
  if (!tail)
    return {
      reason: "Missing quantity, contract description, price, or currency",
    };
  const [, quantity, description, price, ccy] = tail;
  // AMP's fixed-width BUY column ends before the wider SELL column. Preserve
  // blank fields instead of inferring from price or contract text.
  const buy = gap.length < 18 ? quantity : "";
  const sell = gap.length >= 18 ? quantity : "";
  const row: AmpTradeRow = {
    DATE: date,
    "TRADE NUMBER": tradeNumber,
    MARKET: market,
    BUY: buy,
    SELL: sell,
    "CONTRACT DESCRIPTION": description.trim(),
    "TRADE PRICE": price.replaceAll(",", ""),
    CCY: ccy,
  };
  if (
    !DATE.test(row.DATE) ||
    !/^\d+$/.test(row["TRADE NUMBER"]) ||
    (!row.BUY && !row.SELL) ||
    !Number.isFinite(Number(row["TRADE PRICE"])) ||
    !row.CCY
  )
    return { reason: "Failed validation" };
  return { row };
}

function extractSection(text: string, page: number) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const heading = lines.findIndex((line) =>
    normalize(line).includes("PURCHASE&SALE")
  );
  if (heading === -1)
    return {
      rows: [] as AmpTradeRow[],
      skipped: [] as SkippedRow[],
      found: false,
    };
  const rows: AmpTradeRow[] = [],
    skipped: SkippedRow[] = [];
  for (const rawLine of lines.slice(heading + 1)) {
    if (!DATE.test(rawLine.slice(0, 9))) continue;
    const parsed = parseTradeLine(rawLine);
    if (parsed.row) rows.push(parsed.row);
    else
      skipped.push({
        page,
        line: rawLine,
        reason: parsed.reason ?? "Uncertain row",
      });
  }
  return { rows, skipped, found: true };
}

type PdfTextItem = {
  str: string;
  transform: readonly number[];
};

type PdfTextContent = {
  items: PdfTextItem[];
};

function textFromContent(content: PdfTextContent) {
  const lines = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    lines.set(y, [
      ...(lines.get(y) ?? []),
      { x: item.transform[4], text: item.str },
    ]);
  }
  return [...lines.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, items]) => {
      let cursor = 0;
      return items
        .sort((a, b) => a.x - b.x)
        .map(({ x, text }) => {
          const spaces = " ".repeat(Math.max(1, Math.round((x - cursor) / 4)));
          cursor = x + text.length * 4;
          return spaces + text;
        })
        .join("");
    })
    .join("\n");
}

function hasPurchaseAndSaleHeading(content: PdfTextContent) {
  return normalize(
    content.items.map((item) => ("str" in item ? item.str : "")).join("")
  ).includes("PURCHASE&SALE");
}

type PdfPage = {
  getViewport: (options: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
  }) => {
    promise: Promise<void>;
  };
};

async function getOcrText(page: PdfPage) {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({
    canvas,
    canvasContext: canvas.getContext("2d")!,
    viewport,
  }).promise;
  const worker = await createWorker("eng");
  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  return data.text;
}

export default function AmpPdfImporter({
  onConfirm,
}: {
  onConfirm?: (csv: string, rows: AmpTradeRow[]) => Promise<void> | void;
}) {
  const [rows, setRows] = useState<AmpTradeRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const parsePdf = async (file: File) => {
    setLoading(true);
    setRows([]);
    setSkipped([]);
    setMessage(null);
    try {
      //const pdfjs = await getPdfJs();
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() })
        .promise;
      const extracted: AmpTradeRow[] = [],
        uncertain: SkippedRow[] = [];
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = (await pdf.getPage(number)) as PdfPage & {
          getTextContent: () => Promise<PdfTextContent>;
        };
        const content = await page.getTextContent();
        let text = textFromContent(content);
        const hasPurchaseAndSale = hasPurchaseAndSaleHeading(content);
        text = text.replace(
          /P\s*U\s*R\s*C\s*H\s*A\s*S\s*E\s*&\s*S\s*A\s*L\s*E/i,
          "\nPURCHASE & SALE\n"
        );
        if (hasPurchaseAndSale && !normalize(text).includes("PURCHASE&SALE")) {
          text = `PURCHASE & SALE\n${text}`;
        }
        let section = extractSection(text, number);
        if (section.found && section.rows.length === 0)
          section = extractSection(await getOcrText(page), number);
        if (!text.trim())
          section = extractSection(await getOcrText(page), number);
        extracted.push(...section.rows);
        uncertain.push(...section.skipped);
      }
      setRows(extracted);
      setSkipped(uncertain);
      setMessage(
        extracted.length
          ? `Found ${extracted.length} valid PURCHASE & SALE rows.`
          : "No valid PURCHASE & SALE rows found."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to read PDF."
      );
    } finally {
      setLoading(false);
    }
  };

  const csv = [
    HEADER,
    ...rows.map((row) =>
      [
        row.DATE,
        row["TRADE NUMBER"],
        row.MARKET,
        row.BUY,
        row.SELL,
        row["CONTRACT DESCRIPTION"],
        row["TRADE PRICE"],
        row.CCY,
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "amp-purchase-and-sale.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5 text-white">
      <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-blue-400 hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
        <span>{loading ? "Extracting..." : "Choose PDF statement"}</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={loading}
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && parsePdf(e.target.files[0])}
        />
      </label>
      <p className="text-sm text-gray-300">
        {loading ? "Extracting statement..." : message}
      </p>
      {rows.length > 0 && (
        <>
          <div className="overflow-auto">
            <table>
              <thead>
                <tr>
                  {HEADER.split(",").map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row["TRADE NUMBER"]}-${index}`}>
                    {[
                      row.DATE,
                      row["TRADE NUMBER"],
                      row.MARKET,
                      row.BUY,
                      row.SELL,
                      row["CONTRACT DESCRIPTION"],
                      row["TRADE PRICE"],
                      row.CCY,
                    ].map((value, cell) => (
                      <td key={cell}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={download}
              className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-blue-400 hover:bg-blue-600 hover:text-white"
            >
              Download CSV
            </button>

            <button
              onClick={() => onConfirm?.(csv, rows)}
              className="rounded-lg border border-green-700 bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-green-400 hover:bg-green-600"
            >
              Confirm import
            </button>
          </div>
        </>
      )}
      {skipped.length > 0 && (
        <details>
          <summary>{skipped.length} skipped or uncertain row(s)</summary>
          <ul>
            {skipped.map((item, index) => (
              <li key={index}>
                Page {item.page}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
