// Google Apps Script data source — replaces direct EasyStore API calls
// Cached at source every 30 min; we add a 5-min Next.js layer on top

const GAS_URL =
  "https://script.google.com/macros/s/AKfycby0K74MwKCVHf0c0yOv7VY5IwAtTu8EV1LWXPM6-sXJL0874RBp6zF8mJFRo1OPTWWl/exec";

export async function fetchGAS<T>(
  params: Record<string, string>,
  revalidate = 300
): Promise<T> {
  const qs = new URLSearchParams(params);
  const url = `${GAS_URL}?${qs}`;
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GAS ${params.endpoint} error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Response shapes from Apps Script ──────────────────────────────────────

export interface GASProduct {
  sku: string;
  name: string;
  branch: string;
  pic?: string;
  intake_type?: string;
  listed_date: string;           // e.g. "2026-01-15" or "15/01/2026"
  days_listed: number | string;
  sold: boolean;
  active: boolean;
  status: string;                // "Active" | "Sold" | etc.
  sell_price: number | string;
  cost: number | string;
  profit: number | string;
  margin_pct: number | string;
  age_bucket: string;
  easystore_inventory: number | string;
  easystore_status?: string;
  source?: string;
}

export interface GASSale {
  date: string;                  // "YYYY-MM-DD"
  order_number: string;
  branch: string;
  sales_person: string;
  brand: string;
  item: string;                  // product name
  customer: string;
  sku: string;
  cost: number | string;
  sell: number | string;
  gp: number | string;
  margin_pct: number | string;
  channel: string;
  status: string;
  payment: string;
  source?: string;
}

export interface GASLeaderboardEntry {
  sales_person: string;
  sales_count: number | string;
  revenue: number | string;
  cost: number | string;
  gp: number | string;
  gp_pct: number | string;
  aov: number | string;
}
