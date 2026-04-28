import { format, differenceInDays, parseISO } from "date-fns";
import {
  ESOrder,
  ESProduct,
  getLineItemCostPrice,
  getLineItemSellingPrice,
  getOrderBranch,
  getProductCostPrice,
  getProductSellingPrice,
  getProductSKU,
  getProductInventory,
  getSalesperson,
} from "./easystore";

// ── Sales Overview (Page 1) ────────────────────────────────────────────────

export interface BranchRevenue {
  branch: string;
  revenue: number;
  orders: number;
}

export interface SalespersonStats {
  name: string;
  orders: number;
  revenue: number;
}

export interface SalesOverviewData {
  date: string;
  totalRevenue: number;
  byBranch: BranchRevenue[];
  bySalesperson: SalespersonStats[];
  orderCount: number;
}

export function buildSalesOverview(orders: ESOrder[], date: string): SalesOverviewData {
  const branchMap = new Map<string, BranchRevenue>();
  const spMap = new Map<string, SalespersonStats>();
  let totalRevenue = 0;

  for (const order of orders) {
    const orderTotal = parseFloat(order.total_price) || 0;
    totalRevenue += orderTotal;

    const salesperson = getSalesperson(order);
    const sp = spMap.get(salesperson) ?? { name: salesperson, orders: 0, revenue: 0 };
    sp.orders += 1;
    sp.revenue += orderTotal;
    spMap.set(salesperson, sp);

    // Branch from sales_attributions.location
    const branch = getOrderBranch(order);
    const br = branchMap.get(branch) ?? { branch, revenue: 0, orders: 0 };
    br.revenue += orderTotal;
    br.orders += 1;
    branchMap.set(branch, br);
  }

  return {
    date,
    totalRevenue,
    orderCount: orders.length,
    byBranch: Array.from(branchMap.values()).sort((a, b) => b.revenue - a.revenue),
    bySalesperson: Array.from(spMap.values()).sort((a, b) => b.revenue - a.revenue),
  };
}

// ── Product Performance (Page 2) ──────────────────────────────────────────

export interface ProductRow {
  id: number;
  name: string;
  sku: string;
  brand: string;
  branch: string;
  createdAt: string;
  daysToSell: number;
  daysLabel: string;
  status: "Sold" | "Active" | "Draft";
  sellingPrice: number;
  costPrice: number;
  profitRM: number;
  profitPct: number;
  soldAt?: string;
  soldBranch?: string;
}

// Known luxury handbag brands — matched against brands/tags first, then title
const LUXURY_BRANDS = [
  "Chanel", "Louis Vuitton", "LV", "Hermès", "Hermes", "Gucci", "Prada",
  "Dior", "Christian Dior", "Fendi", "Celine", "Céline", "Bottega Veneta",
  "Balenciaga", "Burberry", "Givenchy", "Valentino", "Saint Laurent", "YSL",
  "Loewe", "Mulberry", "Coach", "Kate Spade", "Michael Kors", "Tory Burch",
  "Goyard", "Moynat", "Bvlgari", "Bulgari", "Versace", "Dolce & Gabbana",
  "Miu Miu", "Stella McCartney", "Alexander McQueen", "Furla", "Longchamp",
  "Moschino", "Salvatore Ferragamo", "Ferragamo", "Marni", "Jacquemus",
  "Toteme", "Polène", "Polene", "Marc Jacobs", "Tumi", "Rimowa",
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const BRAND_NORMS = LUXURY_BRANDS.map((b) => ({ original: b, key: norm(b) }));

export function extractBrand(brands: string, tags: string, title: string): string {
  // 1. Dedicated brands field (EasyStore has this)
  const brandField = brands?.trim();
  if (brandField) return brandField;

  const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);

  // 2. Explicit "brand:X" prefix in any tag
  const explicit = tagList.find((t) => norm(t).startsWith("brand:"));
  if (explicit) return explicit.replace(/^brand:/i, "").trim();

  // 3. Tag that exactly matches a known brand
  for (const tag of tagList) {
    const match = BRAND_NORMS.find((b) => b.key === norm(tag));
    if (match) return match.original;
  }

  // 4. Product title starts with a known brand (longest match first)
  const normTitle = norm(title);
  const sorted = [...BRAND_NORMS].sort((a, b) => b.key.length - a.key.length);
  for (const b of sorted) {
    if (normTitle.startsWith(b.key)) return b.original;
  }

  // 5. First meaningful word(s) of title as last resort
  return title.split(/[\s-–]/)[0]?.trim() || "-";
}

export function buildProductRows(
  products: ESProduct[],
  orders: ESOrder[],
  today: Date
): ProductRow[] {
  // Map product_id → first order that contains it (for sold date + branch)
  const soldMap = new Map<number, ESOrder>();
  for (const order of orders) {
    for (const item of order.line_items) {
      if (!soldMap.has(item.product_id)) {
        soldMap.set(item.product_id, order);
      }
    }
  }

  return products.map((p) => {
    const createdAt = parseISO(p.created_at);
    const soldOrder = soldMap.get(p.id);
    const sellingPrice = getProductSellingPrice(p);
    const costPrice = getProductCostPrice(p);
    const profitRM = sellingPrice - costPrice;
    const profitPct = costPrice > 0 ? (profitRM / costPrice) * 100 : 0;
    const inventory = getProductInventory(p);

    // Determine status:
    // - Found in an order → Sold
    // - inventory > 0 and published → Active
    // - inventory > 0 and not published → Draft
    let status: ProductRow["status"] = p.is_published ? "Active" : "Draft";
    let daysToSell = differenceInDays(today, createdAt);
    let daysLabel = `${daysToSell}d`;
    let soldAt: string | undefined;
    let soldBranch: string | undefined;

    if (soldOrder) {
      status = "Sold";
      const soldDate = parseISO(soldOrder.created_at);
      daysToSell = Math.max(0, differenceInDays(soldDate, createdAt));
      daysLabel = `${daysToSell}d`;
      soldAt = format(soldDate, "dd MMM yyyy");
      soldBranch = getOrderBranch(soldOrder);
    }

    // Branch: use sold order's location if sold, else vendors field, else "—"
    const branch = soldBranch ?? (p.vendors?.trim() || "—");

    const brand = extractBrand(p.brands ?? "", p.tags ?? "", p.title);

    return {
      id: p.id,
      name: p.title,
      sku: getProductSKU(p),
      brand,
      branch,
      createdAt: format(createdAt, "dd MMM yyyy"),
      daysToSell,
      daysLabel: status === "Sold" ? daysLabel : `${daysToSell}d (active)`,
      status,
      sellingPrice,
      costPrice,
      profitRM,
      profitPct,
      soldAt,
      soldBranch,
    };
  });
}

// Light version — no orders needed, status from inventory_quantity + is_published.
// inventory_quantity === 0 → Sold (pre-owned items are 1-piece each)
export function buildProductRowsLight(products: ESProduct[], today: Date): ProductRow[] {
  return products.map((p) => {
    const createdAt = parseISO(p.created_at);
    const sellingPrice = getProductSellingPrice(p);
    const costPrice = getProductCostPrice(p);
    const profitRM = sellingPrice - costPrice;
    const profitPct = costPrice > 0 ? (profitRM / costPrice) * 100 : 0;
    const inventory = getProductInventory(p);
    const daysListed = differenceInDays(today, createdAt);

    let status: ProductRow["status"];
    let daysToSell: number;
    let daysLabel: string;

    if (inventory === 0) {
      status = "Sold";
      daysToSell = daysListed; // best estimate without order date
      daysLabel = `${daysToSell}d`;
    } else if (p.is_published) {
      status = "Active";
      daysToSell = daysListed;
      daysLabel = `${daysToSell}d (active)`;
    } else {
      status = "Draft";
      daysToSell = daysListed;
      daysLabel = `${daysToSell}d (draft)`;
    }

    const branch = p.vendors?.trim() || "—";
    const brand = extractBrand(p.brands ?? "", p.tags ?? "", p.title);

    return {
      id: p.id,
      name: p.title,
      sku: getProductSKU(p),
      brand,
      branch,
      createdAt: format(createdAt, "dd MMM yyyy"),
      daysToSell,
      daysLabel,
      status,
      sellingPrice,
      costPrice,
      profitRM,
      profitPct,
    };
  });
}

export function formatRM(amount: number): string {
  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
