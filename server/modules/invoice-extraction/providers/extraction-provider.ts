import type { InvoiceProposal } from "@shared/invoice-extraction/contracts";

export interface InvoiceProviderAsset {
  id: string;
  mimeType: string;
  displayName: string;
  bytes: Buffer;
}

export interface InvoiceProviderRequest {
  assets: readonly InvoiceProviderAsset[];
  model: string;
  reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  background: boolean;
  storeResponse: boolean;
}

export type InvoiceProviderResult =
  | { status: "pending"; responseId: string }
  | { status: "completed"; responseId: string; proposal: InvoiceProposal }
  | {
      status: "failed";
      responseId: string | null;
      failureCode:
        | "PROVIDER_REFUSAL"
        | "PROVIDER_INCOMPLETE"
        | "PROVIDER_FAILED"
        | "PROVIDER_INVALID_OUTPUT";
    };

export interface InvoiceExtractionProviderPort {
  readonly name: "openai";
  isConfigured(): boolean;
  submit(request: InvoiceProviderRequest): Promise<InvoiceProviderResult>;
  retrieve(responseId: string): Promise<InvoiceProviderResult>;
  unwrapWebhook(
    rawBody: string,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): Promise<{ eventId: string; eventType: string; responseId: string }>;
}
