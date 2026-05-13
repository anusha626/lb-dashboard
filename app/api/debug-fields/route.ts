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
  const samples = products.slice(0, 3).map((p) => ({
    name: p.name,
    status: p.status,
    active: p.active,
    sold: p.sold,
    easystore_status: (p as Record<string, unknown>).easystore_status,
    intake_type:      (p as Record<string, unknown>).intake_type,
    easystore_inventory: p.easystore_inventory,
    // show ALL keys on the first product
    allKeys: Object.keys(p),
  }));

  return NextResponse.json({
    totalProducts: products.length,
    uniqueStatus:          uniq(products.map((p) => p.status)),
    uniqueActive:          uniq(products.map((p) => p.active)),
    uniqueSold:            uniq(products.map((p) => p.sold)),
    uniqueEasystoreStatus: uniq(products.map((p) => (p as Record<string, unknown>).easystore_status as string)),
    uniqueIntakeType:      uniq(products.map((p) => (p as Record<string, unknown>).intake_type as string)),
    samples,
  });
}
