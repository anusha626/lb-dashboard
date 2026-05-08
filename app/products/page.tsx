"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Nav from "@/components/Nav";
import type { ProductRow } from "@/lib/transforms";

type ViewMode = "table" | "aging";

function formatRM(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type SortKey = keyof Pick<
  ProductRow,
  "daysToSell" | "sellingPrice" | "costPrice" | "profitRM" | "profitPct" | "name" | "branch" | "status"
>;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Sold:   { bg: "rgba(34,197,94,0.12)",  text: "#22c55e" },
  Active: { bg: "rgba(124,106,247,0.12)", text: "#7c6af7" },
  Draft:  { bg: "rgba(245,158,11,0.12)", text: "#f59e0b" },
};

function StatusBadge({ status }: { status: ProductRow["status"] }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.Active;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: c.bg, color: c.text }}>
      {status}
    </span>
  );
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: "asc" | "desc" }) {
  if (col !== sortKey) return <span className="opacity-20 ml-1">↕</span>;
  return <span className="ml-1" style={{ color: "var(--accent)" }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

type FilterStatus = "All" | "Active" | "Sold" | "Draft";

export default function ProductPerformancePage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("daysToSell");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("All");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // GAS returns all products in one shot — no pagination needed
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products?all=1`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.rows ?? []);
      setTotalPages(1);
      setTotalCount(json.totalCount ?? 0);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoadingAll(false);
    }
  }, []);

  const loadPage = loadAll; // alias — kept for compatibility

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const branches = useMemo(() => {
    const set = new Set(rows.map((r) => r.branch));
    return ["All", ...Array.from(set).sort()];
  }, [rows]);

  const PUBLISH_TOGGLES: { label: string; value: FilterStatus }[] = [
    { label: "All",         value: "All" },
    { label: "Published",   value: "Active" },
    { label: "Unpublished", value: "Draft" },
    { label: "Sold",        value: "Sold" },
  ];

  const filtered = useMemo(() => {
    let out = rows;
    if (filterBranch !== "All") out = out.filter((r) => r.branch === filterBranch);
    if (filterStatus !== "All") out = out.filter((r) => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q)
      );
    }
    if (dateFrom) {
      // listedDateISO is "YYYY-MM-DD"; dateFrom is also "YYYY-MM-DD" — string compare works
      out = out.filter((r) => {
        const iso = (r as unknown as { listedDateISO?: string }).listedDateISO ?? r.createdAt;
        return iso >= dateFrom;
      });
    }
    if (dateTo) {
      out = out.filter((r) => {
        const iso = (r as unknown as { listedDateISO?: string }).listedDateISO ?? r.createdAt;
        return iso <= dateTo;
      });
    }
    return [...out].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, filterBranch, filterStatus, search, dateFrom, dateTo, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function downloadCsv() {
    const headers = ["Name", "SKU", "Brand", "Branch", "Listed Date", "Days", "Status", "Sell Price", "Cost Price", "Profit RM", "Margin %"];
    function esc(v: string | number) {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }
    const lines = [
      headers.join(","),
      ...filtered.map((r) => [
        esc(r.name), esc(r.sku), esc(r.brand), esc(r.branch),
        esc(r.createdAt), esc(r.daysToSell), esc(r.status),
        esc(r.sellingPrice.toFixed(2)), esc(r.costPrice.toFixed(2)),
        esc(r.profitRM.toFixed(2)), esc(r.profitPct.toFixed(1)),
      ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "LB_Products.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const AGING_BUCKETS = [
    { label: "0 – 30 days",  min: 0,  max: 30,  color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
    { label: "31 – 60 days", min: 31, max: 60,  color: "#7c6af7", bg: "rgba(124,106,247,0.1)" },
    { label: "61 – 90 days", min: 61, max: 90,  color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    { label: "90+ days",     min: 91, max: Infinity, color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  ];

  const agingData = useMemo(() => {
    const active = rows.filter((r) => r.status === "Active");
    return AGING_BUCKETS.map((bucket) => {
      const items = active.filter((r) => r.daysToSell >= bucket.min && r.daysToSell <= bucket.max);
      const byBranch: Record<string, { count: number; value: number; cost: number }> = {};
      for (const item of items) {
        const b = item.branch || "Unknown";
        if (!byBranch[b]) byBranch[b] = { count: 0, value: 0, cost: 0 };
        byBranch[b].count += 1;
        byBranch[b].value += item.sellingPrice;
        byBranch[b].cost += item.costPrice;
      }
      return {
        ...bucket,
        count: items.length,
        totalValue: items.reduce((s, r) => s + r.sellingPrice, 0),
        totalCost: items.reduce((s, r) => s + r.costPrice, 0),
        avgDays: items.length > 0 ? Math.round(items.reduce((s, r) => s + r.daysToSell, 0) / items.length) : 0,
        byBranch,
        items: [...items].sort((a, b) => b.daysToSell - a.daysToSell),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const thClass = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none whitespace-nowrap";

  const soldCount = filtered.filter((r) => r.status === "Sold").length;
  const activeCount = filtered.filter((r) => r.status === "Active").length;
  const loadedPct = totalCount > 0 ? Math.round((rows.length / totalCount) * 100) : 0;
  const allLoaded = rows.length >= totalCount && totalCount > 0;

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Product Performance</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Newest products first · sorted by days listed
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* View toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {(["table", "aging"] as ViewMode[]).map((v) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className="px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: viewMode === v ? "var(--accent)" : "var(--bg-card)",
                    color: viewMode === v ? "#fff" : "var(--text-secondary)",
                  }}>
                  {v === "table" ? "Table" : "Stock Aging"}
                </button>
              ))}
            </div>

            {/* Download button (table view only) */}
            {viewMode === "table" && !loading && rows.length > 0 && (
              <button onClick={downloadCsv}
                className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ background: "var(--accent)", color: "#fff" }}>
                ↓ CSV
              </button>
            )}

            {/* Load all button */}
            {!allLoaded && !loading && (
              <button
                onClick={loadAll}
                disabled={loadingAll}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
                style={{ background: "var(--accent-glow)", border: "1px solid var(--accent)", color: "var(--accent)" }}
              >
                {loadingAll ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
                      style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
                    Loading…
                  </>
                ) : (
                  `Load all ${totalCount.toLocaleString()}`
                )}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar (shown while loading all) */}
        {loadingAll && (
          <div className="mb-5">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
              <span>Loading from Google Sheets…</span>
              <span>{rows.length.toLocaleString()} / {totalCount.toLocaleString()}</span>
            </div>
            <div className="w-full rounded-full h-1.5" style={{ background: "var(--border)" }}>
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${loadedPct}%`, background: "var(--accent)" }}
              />
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading products…</span>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl px-5 py-4 mb-6 text-sm"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Stock Aging View ── */}
            {viewMode === "aging" && (
              <div>
                {/* Active only notice */}
                <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
                  Showing <strong style={{ color: "var(--text-primary)" }}>{rows.filter(r => r.status === "Active").length}</strong> active (unsold) products from {rows.length.toLocaleString()} loaded.
                  {!allLoaded && <span className="ml-1" style={{ color: "#f59e0b" }}>Load all products for complete picture.</span>}
                </p>

                {/* Bucket summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  {agingData.map((b) => (
                    <div key={b.label} className="rounded-xl px-4 py-4"
                      style={{ background: b.bg, border: `1px solid ${b.color}40` }}>
                      <div className="text-xs font-medium mb-2" style={{ color: b.color }}>{b.label}</div>
                      <div className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                        {b.count}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {b.count > 0 ? (
                          <>
                            <div>Value: {formatRM(b.totalValue)}</div>
                            <div>Cost: {formatRM(b.totalCost)}</div>
                            <div>Avg age: {b.avgDays}d</div>
                          </>
                        ) : "No items"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Per-bucket detail tables */}
                {agingData.filter(b => b.count > 0).map((b) => (
                  <div key={b.label} className="mb-6 rounded-xl overflow-hidden"
                    style={{ border: `1px solid ${b.color}40`, background: "var(--bg-card)" }}>
                    {/* Bucket header */}
                    <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2"
                      style={{ borderBottom: "1px solid var(--border)", background: b.bg }}>
                      <span className="font-semibold text-sm" style={{ color: b.color }}>
                        {b.label} — {b.count} item{b.count !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {formatRM(b.totalValue)} selling · {formatRM(b.totalCost)} cost
                      </span>
                    </div>

                    {/* Branch sub-totals */}
                    {Object.keys(b.byBranch).length > 1 && (
                      <div className="flex flex-wrap gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                        {Object.entries(b.byBranch).sort((a, z) => z[1].count - a[1].count).map(([branch, stat]) => (
                          <span key={branch} className="text-xs rounded-full px-2.5 py-1"
                            style={{ background: "var(--bg-base)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                            {branch}: <strong style={{ color: "var(--text-primary)" }}>{stat.count}</strong>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Item rows */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: "var(--bg-base)", borderBottom: "1px solid var(--border)" }}>
                            {["Product", "Branch", "Listed", "Days", "Sell Price", "Cost"].map(h => (
                              <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap"
                                style={{ color: "var(--text-secondary)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {b.items.map((row, i) => (
                            <tr key={row.id}
                              style={{ borderBottom: i < b.items.length - 1 ? "1px solid var(--border)" : "none" }}
                              className="hover:bg-[var(--bg-card-hover)] transition-colors">
                              <td className="px-4 py-2.5 max-w-[220px]">
                                <div className="font-medium truncate text-sm" style={{ color: "var(--text-primary)" }} title={row.name}>
                                  {row.name}
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                  {row.brand !== "-" && <span>{row.brand} · </span>}
                                  <span className="font-mono">{row.sku}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>{row.branch}</td>
                              <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>{row.createdAt}</td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span className="font-semibold text-sm" style={{ color: b.color }}>{row.daysToSell}d</span>
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                                {row.sellingPrice > 0 ? formatRM(row.sellingPrice) : "—"}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
                                {row.costPrice > 0 ? formatRM(row.costPrice) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Table View ── */}
            {viewMode === "table" && <>
            {/* Summary chips */}
            <div className="flex flex-wrap gap-3 mb-5">
              {[
                { label: "Loaded", value: `${rows.length.toLocaleString()} / ${totalCount.toLocaleString()}` },
                { label: "Showing", value: filtered.length.toLocaleString() },
                { label: "Active", value: activeCount.toLocaleString() },
                { label: "Sold", value: soldCount.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl px-4 py-2 flex items-center gap-2"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
                  <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                type="text"
                placeholder="Search name, SKU, brand…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm flex-1 min-w-[180px]"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}>
                {branches.map((b) => <option key={b} value={b}>{b === "All" ? "All Branches" : b}</option>)}
              </select>
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {PUBLISH_TOGGLES.map(({ label, value }) => (
                  <button key={value} onClick={() => setFilterStatus(value)}
                    className="px-3 py-2 text-sm transition-colors"
                    style={{
                      background: filterStatus === value ? "var(--accent)" : "var(--bg-card)",
                      color: filterStatus === value ? "#fff" : "var(--text-secondary)",
                      borderRight: value !== "Sold" ? "1px solid var(--border)" : "none",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Date listed range */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Listed</span>
                <input type="date" value={dateFrom} max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }} />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>–</span>
                <input type="date" value={dateTo} min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }} />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="px-2 py-2 rounded-lg text-xs"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-base)" }}>
                      <th className={thClass} style={{ color: "var(--text-secondary)" }} onClick={() => toggleSort("name")}>
                        Product <SortIcon col="name" sortKey={sortKey} dir={sortDir} />
                      </th>
                      <th className={thClass} style={{ color: "var(--text-secondary)" }} onClick={() => toggleSort("branch")}>
                        Branch <SortIcon col="branch" sortKey={sortKey} dir={sortDir} />
                      </th>
                      <th className={thClass} style={{ color: "var(--text-secondary)" }}>Listed</th>
                      <th className={thClass} style={{ color: "var(--text-secondary)" }} onClick={() => toggleSort("daysToSell")}>
                        Days <SortIcon col="daysToSell" sortKey={sortKey} dir={sortDir} />
                      </th>
                      <th className={thClass} style={{ color: "var(--text-secondary)" }}>Qty</th>
                      <th className={thClass} style={{ color: "var(--text-secondary)" }} onClick={() => toggleSort("status")}>
                        Status <SortIcon col="status" sortKey={sortKey} dir={sortDir} />
                      </th>
                      <th className={`${thClass} text-right`} style={{ color: "var(--text-secondary)" }} onClick={() => toggleSort("sellingPrice")}>
                        Sell Price <SortIcon col="sellingPrice" sortKey={sortKey} dir={sortDir} />
                      </th>
                      <th className={`${thClass} text-right`} style={{ color: "var(--text-secondary)" }} onClick={() => toggleSort("costPrice")}>
                        Cost <SortIcon col="costPrice" sortKey={sortKey} dir={sortDir} />
                      </th>
                      <th className={`${thClass} text-right`} style={{ color: "var(--text-secondary)" }} onClick={() => toggleSort("profitRM")}>
                        Profit <SortIcon col="profitRM" sortKey={sortKey} dir={sortDir} />
                      </th>
                      <th className={`${thClass} text-right`} style={{ color: "var(--text-secondary)" }} onClick={() => toggleSort("profitPct")}>
                        Margin <SortIcon col="profitPct" sortKey={sortKey} dir={sortDir} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-5 py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                          No products found
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row, i) => (
                        <tr key={row.id}
                          style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}
                          className="transition-colors hover:bg-[var(--bg-card-hover)]">
                          <td className="px-4 py-3" style={{ maxWidth: expandedIds.has(row.id) ? undefined : "220px" }}>
                            <div
                              className={`font-medium cursor-pointer ${expandedIds.has(row.id) ? "whitespace-normal" : "truncate"}`}
                              style={{ color: "var(--text-primary)" }}
                              onClick={() => setExpandedIds((prev) => {
                                const next = new Set(prev);
                                next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                                return next;
                              })}
                              title={expandedIds.has(row.id) ? undefined : row.name}
                            >
                              {row.name}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                              {row.brand !== "-" && <span>{row.brand} · </span>}
                              <span className="font-mono">{row.sku}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
                            {row.branch}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
                            {row.createdAt}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm font-medium" style={{
                              color: row.status === "Sold" ? "var(--text-secondary)"
                                : row.daysToSell > 90 ? "#ef4444"
                                : row.daysToSell > 30 ? "#f59e0b"
                                : "var(--text-primary)",
                            }}>
                              {row.daysLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-center" style={{ color: "var(--text-primary)" }}>
                            {row.inventory}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap font-medium" style={{ color: "var(--text-primary)" }}>
                            {row.sellingPrice > 0 ? formatRM(row.sellingPrice) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
                            {row.costPrice > 0 ? formatRM(row.costPrice) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap font-semibold"
                            style={{ color: row.profitRM >= 0 ? "#22c55e" : "#ef4444" }}>
                            {row.costPrice > 0 ? formatRM(row.profitRM) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap text-sm"
                            style={{ color: row.profitRM >= 0 ? "#22c55e" : "#ef4444" }}>
                            {row.costPrice > 0 ? `${row.profitPct.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2"
                style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {rows.length.toLocaleString()} of {totalCount.toLocaleString()} products loaded
                  {allLoaded && <span className="ml-2" style={{ color: "var(--green)" }}>✓ All loaded</span>}
                </span>
                <div className="flex gap-2">
                  {!allLoaded && page < totalPages && (
                    <button onClick={() => loadPage(page + 1, true)}
                      className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      Load next 250
                    </button>
                  )}
                  {!allLoaded && !loadingAll && (
                    <button onClick={loadAll}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: "var(--accent-glow)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
                      Load all {(totalCount - rows.length).toLocaleString()} remaining
                    </button>
                  )}
                </div>
              </div>
            </div>
            </>}
          </>
        )}
      </main>
    </>
  );
}
