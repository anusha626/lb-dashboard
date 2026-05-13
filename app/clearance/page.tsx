"use client";

import { useEffect, useState, useMemo } from "react";
import Nav from "@/components/Nav";
import type { ProductRow } from "@/lib/transforms";

type Row = ProductRow & { listedDateISO?: string };

function formatRM(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const AGE_COLOR = (d: number) =>
  d > 180 ? "#ef4444" : d > 120 ? "#f97316" : "#f59e0b";

export default function ClearancePage() {
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterBranch, setFilterBranch] = useState("All");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"daysToSell" | "sellingPrice" | "costPrice">("daysToSell");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/products?all=1");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setAllRows(json.rows ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Only active items aged 90+ days
  const aged90 = useMemo(
    () => allRows.filter((r) => r.status === "Active" && r.daysToSell > 90),
    [allRows]
  );

  const branches = useMemo(() => {
    const set = new Set(aged90.map((r) => r.branch));
    return ["All", ...Array.from(set).filter(Boolean).sort()];
  }, [aged90]);

  const filtered = useMemo(() => {
    let out = aged90;
    if (filterBranch !== "All") out = out.filter((r) => r.branch === filterBranch);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q)
      );
    }
    return [...out].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [aged90, filterBranch, search, sortKey, sortDir]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: typeof sortKey }) {
    if (col !== sortKey) return <span className="opacity-20 ml-1">↕</span>;
    return <span className="ml-1" style={{ color: "var(--accent)" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // Summary stats
  const totalCost = filtered.reduce((s, r) => s + r.costPrice, 0);
  const totalSell = filtered.reduce((s, r) => s + r.sellingPrice, 0);
  const byBranch = useMemo(() => {
    const map = new Map<string, { count: number; cost: number }>();
    for (const r of aged90) {
      const b = r.branch || "Unknown";
      const prev = map.get(b) ?? { count: 0, cost: 0 };
      map.set(b, { count: prev.count + 1, cost: prev.cost + r.costPrice });
    }
    return Array.from(map.entries())
      .map(([branch, d]) => ({ branch, ...d }))
      .sort((a, b) => b.count - a.count);
  }, [aged90]);

  function downloadCsv() {
    const headers = ["Name", "SKU", "Branch", "Listed Date", "Days", "Sell Price", "Cost Price"];
    function esc(v: string | number) {
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }
    const lines = [
      headers.join(","),
      ...filtered.map((r) =>
        [esc(r.name), esc(r.sku), esc(r.branch), esc(r.createdAt), esc(r.daysToSell),
         esc(r.sellingPrice.toFixed(0)), esc(r.costPrice.toFixed(0))].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "LB_Clearance_90Plus.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  };

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              🚨 Clear This Now
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Active stock sitting for <strong style={{ color: "#f59e0b" }}>90+ days</strong> — needs to move
            </p>
          </div>
          {!loading && filtered.length > 0 && (
            <button onClick={downloadCsv}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shrink-0"
              style={{ background: "var(--accent)", color: "#fff" }}>
              ↓ Export CSV
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading stock…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl px-5 py-4 mb-6 text-sm"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Items to clear", value: aged90.length.toString(), color: "#ef4444" },
                { label: "Cost tied up", value: formatRM(aged90.reduce((s,r)=>s+r.costPrice,0)), color: "#f59e0b" },
                { label: "Sell value", value: formatRM(aged90.reduce((s,r)=>s+r.sellingPrice,0)), color: "var(--text-primary)" },
                { label: "Showing (filtered)", value: filtered.length.toString(), color: "var(--accent)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl px-4 py-4"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{label}</div>
                  <div className="text-lg font-bold" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Branch breakdown */}
            {byBranch.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {byBranch.map(({ branch, count, cost }) => (
                  <button
                    key={branch}
                    onClick={() => setFilterBranch(filterBranch === branch ? "All" : branch)}
                    className="rounded-lg px-3 py-2 text-xs flex items-center gap-2 transition-colors"
                    style={{
                      background: filterBranch === branch ? "rgba(239,68,68,0.15)" : "var(--bg-card)",
                      border: `1px solid ${filterBranch === branch ? "#ef4444" : "var(--border)"}`,
                      color: filterBranch === branch ? "#ef4444" : "var(--text-secondary)",
                    }}>
                    <strong style={{ color: "var(--text-primary)" }}>{branch}</strong>
                    <span>{count} items · {formatRM(cost)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                type="text"
                placeholder="Search name or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm flex-1 min-w-[200px]"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}>
                {branches.map((b) => <option key={b} value={b}>{b === "All" ? "All Branches" : b}</option>)}
              </select>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              <div className="rounded-xl flex items-center justify-center py-16 text-sm"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                {aged90.length === 0 ? "🎉 No items over 90 days! Great job clearing stock." : "No results for your search."}
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                {/* Summary row */}
                <div className="px-4 py-2.5 flex items-center justify-between text-xs"
                  style={{ background: "rgba(239,68,68,0.06)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>
                    <strong style={{ color: "var(--text-primary)" }}>{filtered.length}</strong> items
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Cost: <strong style={{ color: "#f59e0b" }}>{formatRM(totalCost)}</strong>
                    <span className="mx-2">·</span>
                    Sell: <strong style={{ color: "var(--text-primary)" }}>{formatRM(totalSell)}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-base)" }}>
                        <th style={thStyle}>Product</th>
                        <th style={thStyle}>Branch</th>
                        <th style={thStyle}>Listed</th>
                        <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("daysToSell")}>
                          Days <SortIcon col="daysToSell" />
                        </th>
                        <th style={{ ...thStyle, textAlign: "right" }} onClick={() => toggleSort("sellingPrice")}>
                          Sell Price <SortIcon col="sellingPrice" />
                        </th>
                        <th style={{ ...thStyle, textAlign: "right" }} onClick={() => toggleSort("costPrice")}>
                          Cost <SortIcon col="costPrice" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, i) => {
                        const ageColor = AGE_COLOR(row.daysToSell);
                        return (
                          <tr key={row.id}
                            style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}
                            className="transition-colors hover:bg-[var(--bg-card-hover)]">
                            <td className="px-4 py-3" style={{ maxWidth: 260 }}>
                              <div className="font-medium truncate text-sm" style={{ color: "var(--text-primary)" }} title={row.name}>
                                {row.name}
                              </div>
                              <div className="text-xs mt-0.5 font-mono" style={{ color: "var(--text-secondary)" }}>
                                {row.sku}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
                              {row.branch || "—"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
                              {row.createdAt}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="font-bold text-sm px-2 py-0.5 rounded-full"
                                style={{ color: ageColor, background: `${ageColor}18` }}>
                                {row.daysToSell}d
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right font-semibold" style={{ color: "var(--text-primary)" }}>
                              {row.sellingPrice > 0 ? formatRM(row.sellingPrice) : "—"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm" style={{ color: "var(--text-secondary)" }}>
                              {row.costPrice > 0 ? formatRM(row.costPrice) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
