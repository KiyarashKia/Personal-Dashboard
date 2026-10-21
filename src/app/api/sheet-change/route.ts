import { NextResponse } from "next/server";
import { verifySheetChange } from "@/lib/webhook";
import { invalidateDashboard } from "@/lib/sheets";
import { configuredSheetId } from "@/lib/source-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = process.env.GOOGLE_WEBHOOK_SECRET ?? "";
  if (secret.length < 32)
    return NextResponse.json(
      { error: "Edit notifications are not configured." },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 8192)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  const raw = await request.text();
  const event = verifySheetChange(
    raw,
    request.headers.get("x-cadence-signature"),
    secret,
    configuredSheetId(),
  );
  if (!event)
    return NextResponse.json(
      { error: "Invalid notification." },
      { status: 401 },
    );
  // Invalidation is cheap: no Google read occurs until a visitor needs fresh data.
  invalidateDashboard(event.sheetId, event.structure);
  return NextResponse.json(
    { accepted: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
