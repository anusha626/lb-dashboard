// EasyStore Public API client
// Base: https://lbstore.easy.co/api/3.0
// Auth: EasyStore-Access-Token header

const BASE_URL = "https://lbstore.easy.co/api/3.0";

export function getHeaders() {
  const token = process.env.EASYSTORE_API_KEY;
  if (!token) throw new Error("EASYSTORE_API_KEY env var is not set");
  return {
    "EasyStore-Access-Token": token,
    "Content-Type": "application/json",
  };
}

async function fetchOnePage<T>(
  path: string,
  resultsKey: string,
  page: number,
  limit: number,
  params: Record<string, string>,
  revalidate: number,
  retries = 3
): Promise<{ batch: T[]; total: number }> {
  const qs = new URLSearchParams({ limit: String(limit), page: String(page), ...params });
  const url = `${BASE_URL}${path}?${qs}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, { headers: getHeaders(), next: { revalidate } });
    if (res.ok) {
      const json = await res.json();
      return { batch: json[resultsKey] ?? [], total: json.total_count ?? 0 };
    }
    if (res.status !== 504 || attempt === retries - 1) {
      const text = await res.text();
      throw new Error(`EasyStore API error ${res.status}: ${text}`);
    }
    // 504: back off then retry
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error("EasyStore API: max retries exceeded");
}

async function fetchAll<T>(
  path: string,
  resultsKey: string,
  params: Record<string, string> = {},
  revalidate = 300
): Promise<T[]> {
  const limit = 250;

  // Fetch page 1 to get total count
  const { batch: first, total } = await fetchOnePage<T>(path, resultsKey, 1, limit, params, revalidate);
  const results: T[] = [...first];
  if (first.length < limit) return results;

  // Fetch remaining pages in parallel
  const totalPages = Math.ceil(total / limit);
  const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const settled = await Promise.allSettled(
    remaining.map((p) => fetchOnePage<T>(path, resultsKey, p, limit, params, revalidate))
  );
  for (const r of settled) {
    if (r.status === "fulfilled") results.push(...r.value.batch);
    else throw r.reason;
  }

  return results;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface ESStaffAttribution {
  id: number;
  user_id: number;
  user_name: string;
}

export interface ESLocationAttribution {
  id: number;
  order_id: number;
  location_id: number;
  location_name: string;
}

export interface ESLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  product_name: string;
  sku: string;
  price: string;
  cost_price: string | null; // actual cost price field
  quantity: number;
  fulfillment_order_location_id: number | null;
}

export interface ESCustomer {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface ESOrder {
  id: number;
  order_number: string;
  created_at: string;
  total_price: string;
  financial_status: string;
  fulfillment_status: string | null;
  note: string | null;
  tags: string | null;
  location_id: number | null;
  source_name: string | null;
  customer: ESCustomer | null;
  line_items: ESLineItem[];
  sales_attributions: {
    staff: ESStaffAttribution[];
    location: ESLocationAttribution[];
  };
}

export interface ESProductVariant {
  id: number;
  sku: string;
  price: string;
  compare_at_price: string | null;
  cost_price: string | null; // actual cost price field
  inventory_quantity: number;
}

export interface ESProduct {
  id: number;
  title: string;
  vendors: string;  // EasyStore uses "vendors" (plural)
  brands: string;   // dedicated brands field
  tags: string;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  published_at: string | null;
  variants: ESProductVariant[];
}

export interface ESLocation {
  id: number;
  name: string;
  address1: string;
  address2: string | null;
}

// ── Fetch functions ────────────────────────────────────────────────────────

export async function fetchOrders(params: Record<string, string> = {}): Promise<ESOrder[]> {
  return fetchAll<ESOrder>("/orders.json", "orders", params);
}

export async function fetchOrdersByDate(dateStr: string): Promise<ESOrder[]> {
  const start = `${dateStr}T00:00:00+08:00`;
  const end = `${dateStr}T23:59:59+08:00`;
  return fetchOrders({ created_at_min: start, created_at_max: end, status: "any" });
}

export async function fetchProducts(): Promise<ESProduct[]> {
  return fetchAll<ESProduct>("/products.json", "products");
}

export async function fetchLocations(): Promise<ESLocation[]> {
  const res = await fetch(`${BASE_URL}/locations.json`, {
    headers: getHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Locations fetch failed: ${res.status}`);
  const json = await res.json();
  return json.locations ?? [];
}

// ── Field mapping helpers ──────────────────────────────────────────────────

// Load staff config from data/staff.json and build lookup map
import staffConfig from "@/data/staff.json";

function buildStaffMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of staffConfig as { display: string; aliases: string[] }[]) {
    for (const alias of entry.aliases) {
      map[alias.toLowerCase()] = entry.display;
    }
  }
  return map;
}

const STAFF_NAME_MAP = buildStaffMap();

function normaliseName(raw: string): string {
  return STAFF_NAME_MAP[raw.toLowerCase().trim()] ?? raw;
}

// First-line patterns that are clearly NOT a staff name
const NOT_A_NAME = /sale|transfer|cash|online|walk|mbb|rhb|bank|maybank|rm\d|consign|chatdaddy|whatsapp|instagram|company|senangpay|mastercard|visa|credit|debit|website/i;

export function getSalesperson(order: ESOrder): string {
  const note = order.note?.trim() ?? "";
  const rawStaff = order.sales_attributions?.staff?.[0]?.user_name;

  // 1. Company sale — label explicitly (no individual commission)
  if (/^company\s*sale/i.test(note)) return "Company Sale";

  // 2. Staff attribution — only trust it if it maps to a known name in our list.
  //    ChatDaddy / online orders often auto-assign a system user; in that case
  //    we fall through to check the note and tags instead.
  if (rawStaff) {
    const mapped = STAFF_NAME_MAP[rawStaff.toLowerCase().trim()];
    if (mapped) return mapped;
  }

  // 3. Check all comma-separated segments of the note, plus first 1-2 words of each
  //    Handles "ONLINE TRANSFER, MINKEI, LILY" — name at any position
  if (note) {
    const segments = note.split(",").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      const words = seg.split(/\s+/).filter(Boolean);
      const one = words[0]?.toLowerCase() ?? "";
      const two = words.slice(0, 2).join(" ").toLowerCase();
      if (STAFF_NAME_MAP[two]) return STAFF_NAME_MAP[two];
      if (STAFF_NAME_MAP[one]) return STAFF_NAME_MAP[one];
    }
  }

  // 4. Order tags — check each tag against known staff names
  const tags = (order.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  for (const tag of tags) {
    const mapped = STAFF_NAME_MAP[tag];
    if (mapped) return mapped;
  }

  // 5. Full first line of note (short lines that don't look like payment info)
  if (note) {
    const firstLine = note.split("\n")[0].trim();
    if (firstLine.length > 0 && firstLine.length <= 30 && !NOT_A_NAME.test(firstLine)) {
      const capitalised = firstLine.split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      return normaliseName(capitalised);
    }
  }

  // 6. Fall back to raw staff attribution for POS orders where the user name
  //    isn't in our alias list yet (keeps them out of "Unknown")
  if (rawStaff) return normaliseName(rawStaff);

  return "Unknown";
}

export function getCustomerName(order: ESOrder): string {
  const c = order.customer;
  if (!c) return "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
}

export function getOrderBranch(order: ESOrder): string {
  return order.sales_attributions?.location?.[0]?.location_name ?? "Unknown";
}

export function getLineItemCostPrice(item: ESLineItem): number {
  return parseFloat(item.cost_price ?? "0") || 0;
}

export function getLineItemSellingPrice(item: ESLineItem): number {
  return parseFloat(item.price) || 0;
}

export function getProductCostPrice(product: ESProduct): number {
  return parseFloat(product.variants[0]?.cost_price ?? "0") || 0;
}

export function getProductSellingPrice(product: ESProduct): number {
  return parseFloat(product.variants[0]?.price ?? "0") || 0;
}

export function getProductSKU(product: ESProduct): string {
  return product.variants[0]?.sku ?? "-";
}

export function getProductInventory(product: ESProduct): number {
  return product.variants[0]?.inventory_quantity ?? 0;
}

// Only count orders that have been paid (exclude pending, voided, refunded)
const PAID_STATUSES = new Set(["paid", "partially_paid", "partially_refunded"]);
export function isPaidOrder(order: ESOrder): boolean {
  return PAID_STATUSES.has(order.financial_status);
}
