import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getHeaders } from "@/lib/easystore";
import { buildProductRowsLight } from "@/lib/transforms";
import type { ESProduct } from "@/lib/easystore";

const BASE_URL = "https://lbstore.easy.co/api/3.0";
const PAGE_SIZE = 250;

async function fetchPage(page: number): Promise<{ products: ESProduct[]; totalCount: number }> {
  const qs = new URLSearchParams({
    limit: String(PAGE_SIZE),
    page: String(page),
    sort: "created_at.asc",
  });
  const res = await fetch(`${BASE_URL}/products.json?${qs}`, {
    headers: getHeaders(),
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EasyStore API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  return { products: json.products ?? [], totalCount: json.total_count ?? 0 };
}

// Cache a single page for 10 minutes — used for progressive loading
const getCachedPage = unstable_cache(
  async (page: number) => {
    const { products, totalCount } = await fetchPage(page);
    const rows = buildProductRowsLight(products, new Date());
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    return { rows, page, totalPages, totalCount };
  },
  ["products-page"],
  { revalidate: 600 }
);

// Cache the full product list for 30 minutes — the slow one
const getCachedAllProducts = unstable_cache(
  async () => {
    const { products: firstPage, totalCount } = await fetchPage(1);
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const allProducts: ESProduct[] = [...firstPage];
    const BATCH = 6;

    for (let i = 0; i < remaining.length; i += BATCH) {
      const batch = remaining.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map((p) => fetchPage(p)));
      for (const r of results) {
        if (r.status === "fulfilled") allProducts.push(...r.value.products);
      }
    }

    const rows = buildProductRowsLight(allProducts, new Date());
    return { rows, totalPages, totalCount };
  },
  ["products-all"],
  { revalidate: 1800 }
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const loadAll = searchParams.get("all") === "1";

  try {
    if (loadAll) {
      const { rows, totalPages, totalCount } = await getCachedAllProducts();
      return NextResponse.json({ rows, page: totalPages, totalPages, totalCount });
    }
    const result = await getCachedPage(page);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
