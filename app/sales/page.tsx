"use client";

import { useEffect, useState, useCallback } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import Nav from "@/components/Nav";

function formatRM(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface SalesRow {
  Order_ID: string;
  Order_Date: string;
  Month_Year: string;
  Salesperson: string;
  Location: string;
  Product_SKU: string;
  Brand: string;
  Sale_Price: string;
  Channel: string;
  Transaction_Type: string;
}

const COLUMNS = [
  { key: "Order_ID",        label: "Order ID" },
  { key: "Order_Date",      label: "Date" },
  { key: "Salesperson",     label: "Salesperson" },
  { key: "Location",        label: "Location" },
  { key: "Product_SKU",     label: "SKU" },
  { key: "Brand",           label: "Brand" },
  { key: "Sale_Price",      label: "Sale Price (RM)" },
  { key: "Channel",         label: "Channel" },
  { key: "Transaction_Type",label: "Type" },
];

const SP_COLORS: Record<string, string> = {
  "Company Sale": "#8b8fa8",
  "Unknown":      "#ef4444",
};

export default function SalesExportPage() {
  const now = new Date();
  const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo]     = useState(format(now, "yyyy-MM-dd"));
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/sales-export?from=${f}&to=${t}&format=json`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const [hasLoaded, setHasLoaded] = useState(false);

  async function loadAndMark(f: string, t: string) {
    setHasLoaded(true);
    await load(f, t);
  }

  function applyPreset(offset: number) {
    const target = subMonths(now, offset);
    const f = format(startOfMonth(target), "yyyy-MM-dd");
    const t = offset === 0 ? format(now, "yyyy-MM-dd") : format(new Date(target.getFullYear(), target.getMonth() + 1, 0), "yyyy-MM-dd");
    setFrom(f); setTo(t);
    loadAndMark(f, t);
  }

  function downloadCsv() {
    window.open(`/api/sales-export?from=${from}&to=${to}`, "_blank");
  }

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.Order_ID.toLowerCase().includes(q) ||
      r.Salesperson.toLowerCase().includes(q) ||
      r.Product_SKU.toLowerCase().includes(q) ||
      r.Brand.toLowerCase().includes(q) ||
      r.Location.toLowerCase().includes(q)
    );
  });

  const totalRevenue = filtered.reduce((s, r) => s + (parseFloat(r.Sale_Price) || 0), 0);
  const companySales = filtered.filter((r) => r.Salesperson === "Company Sale").length;
  const unknown      = filtered.filter((r) => r.Salesperson === "Unknown").length;

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Sales Data</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              All orders in LBITE_Sales_Import format
            </p>
          </div>
          <button
            onClick={downloadCsv}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shrink-0"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            ↓ Download CSV
          </button>
        </div>

        {/* Date controls */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {[{ label: "This Month", offset: 0 }, { label: "Last Month", offset: 1 }, { label: "2 Months Ago", offset: 2 }].map(({ label, offset }) => (
            <button key={label} onClick={() => applyPreset(offset)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <input type="date" value={from} max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }} />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>to</span>
            <input type="date" value={to} min={from} max={format(now, "yyyy-MM-dd")}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }} />
            <button onClick={() => loadAndMark(from, to)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent-glow)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
              Load
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading sales data…</span>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl px-5 py-4 mb-5 text-sm"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && !hasLoaded && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="text-3xl mb-1">📋</div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Select a date range and click Load</p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Pick a preset above or enter custom dates</p>
          </div>
        )}

        {!loading && !error && hasLoaded && (
          <>
            {/* Summary */}
            <div className="flex flex-wrap gap-3 mb-4">
              {[
                { label: "Rows",          value: filtered.length.toLocaleString() },
                { label: "Total Revenue", value: formatRM(totalRevenue) },
                { label: "Company Sales", value: companySales },
                { label: "Unknown SP",    value: unknown, warn: unknown > 0 },
              ].map(({ label, value, warn }) => (
                <div key={label} className="rounded-xl px-4 py-2 flex items-center gap-2"
                  style={{ background: "var(--bg-card)", border: `1px solid ${warn ? "rgba(239,68,68,0.4)" : "var(--border)"}` }}>
                  <span className="text-xs" style={{ color: warn ? "#ef4444" : "var(--text-secondary)" }}>{label}</span>
                  <span className="font-semibold text-sm" style={{ color: warn ? "#ef4444" : "var(--text-primary)" }}>{value}</span>
                </div>
              ))}
              <input
                type="text" placeholder="Search order, name, SKU, brand…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="ml-auto px-3 py-1.5 rounded-lg text-sm flex-1 min-w-[180px]"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            </div>

            {/* Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-base)" }}>
                      {COLUMNS.map(({ label }) => (
                        <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                          style={{ color: "var(--text-secondary)" }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNS.length} className="px-5 py-12 text-center text-sm"
                          style={{ color: "var(--text-secondary)" }}>
                          No data for this period
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row, i) => {
                        const spColor = SP_COLORS[row.Salesperson];
                        return (
                          <tr key={i}
                            style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}
                            className="hover:bg-[var(--bg-card-hover)] transition-colors">
                            <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{row.Order_ID}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>{row.Order_Date}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap font-medium"
                              style={{ color: spColor ?? "var(--text-primary)" }}>
                              {row.Salesperson}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>{row.Location}</td>
                            <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{row.Product_SKU || "—"}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-primary)" }}>{row.Brand || "—"}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap font-semibold text-right" style={{ color: "var(--accent)" }}>
                              {formatRM(parseFloat(row.Sale_Price) || 0)}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>{row.Channel}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>{row.Transaction_Type}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                {filtered.length} rows · {formatRM(totalRevenue)} total
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
