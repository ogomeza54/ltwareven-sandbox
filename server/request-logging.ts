import { randomUUID } from "node:crypto";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveRequestId(inbound: string | undefined): string {
  return inbound && uuidPattern.test(inbound) ? inbound : randomUUID();
}

export function mayCaptureJsonResponse(path: string): boolean {
  return !path.startsWith("/api/invoice-");
}

export function safeApiLogPath(path: string): string {
  if (path.startsWith("/api/invoice-drafts/")) {
    return "/api/invoice-drafts/:draftId";
  }
  if (path.startsWith("/api/invoice-extraction-runs/")) {
    return "/api/invoice-extraction-runs/:runId";
  }
  return path;
}
