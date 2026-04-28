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

async function fetchAll<T>(
  path: string,
  resultsKey: string,
  params: Record<string, string> = {},
  revalidate = 300
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const limit = 250;

  while (true) {
    const qs = new URLSearchParams({ limit: String(limit), page: String(page), ...params });
    const res = await fetch(`${BASE_URL}${path}?${qs}`, {
      headers: getHeaders(),
      next: { revalidate },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`EasyStore API error ${res.status}: ${text}`);
    }
    const json = await res.json();
    const batch: T[] = json[resultsKey] ?? [];
    results.push(...batch);
    if (batch.length < limit) break;
    page++;
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

// Canonical staff name map — normalise note variations → display name
const STAFF_NAME_MAP: Record<string, string> = {
  "minkei":       "Min Kei",
  "min kei":      "Min Kei",
  "lbite minkei": "Min Kei",
  "eronne":       "Eronne",
  "eronne khoo":  "Eronne",
  "eileen":       "Eileen",
  "eileen ooi":   "Eileen",
  "frankie":      "Frankie",
  "riska":        "Riska",
  "riska lbite":  "Riska",
  "thong shiung": "Thong Shiung",
  "pheng thong":  "Pheng Thong",
  "anusha":       "Anusha",
  "adelyn":       "Adelyn",
};

function normaliseName(raw: string): string {
  return STAFF_NAME_MAP[raw.toLowerCase().trim()] ?? raw;
}

// First-line patterns that are clearly NOT a staff name
const NOT_A_NAME = /sale|transfer|cash|online|walk|mbb|rhb|bank|maybank|rm\d|consign|chatdaddy|whatsapp|instagram|company|senangpay|mastercard|visa|credit|debit|website/i;

export function getSalesperson(order: ESOrder): string {
  const note = order.note?.trim() ?? "";

  // 1. Company sale — label explicitly (no individual commission)
  if (/^company\s*sale/i.test(note)) return "Company Sale";

  // 2. Primary: sales_attributions.staff (POS / assigned staff)
  const staffName = order.sales_attributions?.staff?.[0]?.user_name;
  if (staffName) return normaliseName(staffName);

  // 3. First word of note checked against known staff map
  //    Handles "ERONNE ONLINE TRANSFER MBB..." where the full line fails NOT_A_NAME
  if (note) {
    const firstWord = note.split(/[\s\n]/)[0].toLowerCase();
    const mappedWord = STAFF_NAME_MAP[firstWord];
    if (mappedWord) return mappedWord;
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

  return "Unknown";
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
