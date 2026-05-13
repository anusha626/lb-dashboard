import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchGAS } from "@/lib/gas";
import type { GASProduct } from "@/lib/gas";
import type { ProductRow } from "@/lib/transforms";

// Try to parse multiple date formats and return "dd MMM yyyy"
function formatListedDate(raw: string): string {
  if (!raw) return "—";
  // ISO: "2026-01-15"
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    return d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
  }
  // DD/MM/YYYY: "15/01/2026"
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}T12:00:00`);
    return d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
  }
  return raw; // return as-is if unparseable
}

// Return ISO "YYYY-MM-DD" for date comparison in filters
function isoFromListedDate(raw: string): string {
  if (!raw) return "";
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

// Compute days from listed_date → today ourselves so aging is always exact,
// not dependent on GAS's pre-computed (potentially stale) days_listed value.
function daysFromListedDate(raw: string): number {
  const iso = isoFromListedDate(raw);
  if (!iso) return 0;
  const listed = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - listed.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

function mapGASProduct(p: GASProduct, i: number): ProductRow & { listedDateISO: string } {
  // Always recalculate from listed_date — don't trust GAS's cached days_listed
  const daysListed = p.listed_date
    ? daysFromListedDate(p.listed_date)
    : Number(p.days_listed) || 0;
  const statusStr = (p.status || "").toLowerCase();
  const isSold = p.sold === true || statusStr === "sold";
  const isActive = !isSold && (p.active === true || statusStr === "active");

  let status: ProductRow["status"];
  let daysLabel: string;
  if (isSold) {
    status = "Sold";
    daysLabel = `${daysListed}d`;
  } else if (isActive) {
    status = "Active";
    daysLabel = `${daysListed}d (active)`;
  } else {
    status = "Draft";
    daysLabel = `${daysListed}d (draft)`;
  }

  return {
    id: i,
    name: p.name || "—",
    sku: p.sku || "—",
    brand: "-",
    branch: p.branch || "—",
    createdAt: formatListedDate(p.listed_date),   // display-friendly
    listedDateISO: isoFromListedDate(p.listed_date), // for date filter
    daysToSell: daysListed,
    daysLabel,
    status,
    sellingPrice: Number(p.sell_price) || 0,
    costPrice: Number(p.cost) || 0,
    profitRM: Number(p.profit) || 0,
    profitPct: Number(p.margin_pct) || 0,
    inventory: Number(p.easystore_inventory) || 0,
    intakeType: p.intake_type || "",
  };
}

const getCachedProducts = unstable_cache(
  async () => {
    const data = await fetchGAS<{ products: GASProduct[] }>({ endpoint: "products" }, 1800);
    const products = data.products ?? [];
    const rows = products.map(mapGASProduct);
    return { rows, totalCount: rows.length };
  },
  ["gas-products-v3"],
  { revalidate: 1800 }
);

export async function GET() {
  try {
    const { rows, totalCount } = await getCachedProducts();
    // Always return everything — GAS delivers all products in one shot
    return NextResponse.json({ rows, page: 1, totalPages: 1, totalCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
