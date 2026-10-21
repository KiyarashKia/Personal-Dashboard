import { NextResponse } from "next/server";
import { getDashboardData, SourceError } from "@/lib/sheets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    return NextResponse.json(await getDashboardData(), { headers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SourceError
            ? error.message
            : "The tracker is temporarily unavailable.",
        code: error instanceof SourceError ? error.code : "connection",
      },
      {
        status: 503,
        headers: {
          ...headers,
          "Retry-After": String(
            error instanceof SourceError ? error.retryAfter : 60,
          ),
        },
      },
    );
  }
}
