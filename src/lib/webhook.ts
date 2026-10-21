import { createHmac, timingSafeEqual } from "node:crypto";
export interface SheetChange {
  sheetId: string;
  timestamp: number;
  nonce: string;
  tabs: string[];
  structure: boolean;
}
export function verifySheetChange(
  raw: string,
  signature: string | null,
  secret: string,
  expectedSheetId: string,
  now = Date.now(),
): SheetChange | null {
  if (
    secret.length < 32 ||
    !signature ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    Buffer.byteLength(raw) > 8192
  )
    return null;
  const expected = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;
  try {
    const event = JSON.parse(raw) as SheetChange;
    if (
      event.sheetId !== expectedSheetId ||
      !Number.isFinite(event.timestamp) ||
      Math.abs(now - event.timestamp) > 300_000 ||
      typeof event.nonce !== "string" ||
      event.nonce.length > 80 ||
      !Array.isArray(event.tabs) ||
      event.tabs.length > 40 ||
      !event.tabs.every((t) => typeof t === "string" && t.length <= 120) ||
      typeof event.structure !== "boolean"
    )
      return null;
    return event;
  } catch {
    return null;
  }
}
