import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifySheetChange } from "../src/lib/webhook";
const secret = "a-local-test-secret-with-more-than-32-characters";
const event = {
  sheetId: "test-sheet",
  timestamp: 123000,
  nonce: "local-test-event",
  tabs: ["Oct 2026"],
  structure: false,
};
const raw = JSON.stringify(event),
  signature = createHmac("sha256", secret).update(raw).digest("hex");
describe("signed edit notifications", () => {
  it("accepts a fresh authentic event for the configured sheet", () =>
    expect(
      verifySheetChange(raw, signature, secret, "test-sheet", 124000),
    ).toEqual(event));
  it("rejects tampered data, wrong keys, malformed signatures and different sheets", () => {
    expect(
      verifySheetChange(raw + " ", signature, secret, "test-sheet", 124000),
    ).toBeNull();
    expect(
      verifySheetChange(
        raw,
        signature,
        "another-secret-that-is-long-enough-12345",
        "test-sheet",
        124000,
      ),
    ).toBeNull();
    expect(
      verifySheetChange(raw, "malformed", secret, "test-sheet", 124000),
    ).toBeNull();
    expect(
      verifySheetChange(raw, signature, secret, "another-sheet", 124000),
    ).toBeNull();
  });
  it("rejects old or future-dated replay events and weak secrets", () => {
    expect(
      verifySheetChange(raw, signature, secret, "test-sheet", 999000),
    ).toBeNull();
    expect(
      verifySheetChange(raw, signature, secret, "test-sheet", -999000),
    ).toBeNull();
    expect(
      verifySheetChange(raw, signature, "weak", "test-sheet", 124000),
    ).toBeNull();
  });
});
