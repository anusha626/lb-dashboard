import { NextRequest, NextResponse } from "next/server";
import { fetchOrdersByDate } from "@/lib/easystore";
import { buildSalesOverview } from "@/lib/transforms";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  try {
    const orders = await fetchOrdersByDate(date);
    const overview = buildSalesOverview(orders, date);
    return NextResponse.json(overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
