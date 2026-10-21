import "server-only";

export function configuredSheetId() {
  return process.env.GOOGLE_SHEET_ID?.trim() ?? "";
}
