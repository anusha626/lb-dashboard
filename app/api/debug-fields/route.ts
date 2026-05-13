import { NextResponse } from "next/server";
import { fetchGAS } from "@/lib/gas";
import type { GASProduct } from "@/lib/gas";

// Temporary debug route — returns unique values of key fields across all products
// Visit /api/debug-fields to diagnose mapping issues
export async function GET() {
  const data = await fetchGAS<{ products: GASProduct[] }>({ endpoint: "products" }, 0);
  const products = data.products ?? [];

  const uniq = (arr: (string | number | boolean | undefined | null)[]) =>
    [...new Set(arr.map(String))].sort();

  // Show a few sample products to inspect raw shape
  // Cast to any for inspection — this is a temporary debug route only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = products as any[];

  const samples = raw.slice(0, 3).map((p) => ({
    name: p.name,
    status: p.status,
    active: p.active,
    sold: p.sold,
    easystore_status: p.easystore_status,
    intake_type: p.intake_type,
    easystore_inventory: p.easystore_inventory,
    allKeys: Object.keys(p),
  }));

  return NextResponse.json({
    totalProducts: products.length,
    uniqueStatus:          uniq(raw.map((p) => p.status)),
    uniqueActive:          uniq(raw.map((p) => p.active)),
    uniqueSold:            uniq(raw.map((p) => p.sold)),
    uniqueEasystoreStatus: uniq(raw.map((p) => p.easystore_status)),
    uniqueIntakeType:      uniq(raw.map((p) => p.intake_type)),
    samples,
  });
}
