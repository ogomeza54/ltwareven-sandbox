import OpenAI from "openai";
import {
  invoiceProposalSchema,
  type InvoiceProposal,
} from "@shared/invoice-extraction/contracts";
import type {
  InvoiceExtractionProviderPort,
  InvoiceProviderRequest,
  InvoiceProviderResult,
} from "./extraction-provider";
import { reconcileInvoiceDescriptions } from "../domain/invoice-description-reconciliation";

const nullableObservedValue = {
  type: "object",
  additionalProperties: false,
  required: ["observed", "normalized", "confidence", "sourceAssetId", "sourcePage"],
  properties: {
    observed: { type: ["string", "null"] },
    normalized: { type: ["string", "null"] },
    confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
    sourceAssetId: { type: ["string", "null"] },
    sourcePage: { type: ["integer", "null"], minimum: 1 },
  },
} as const;

export const invoiceProposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "header", "lines", "uncertainties"],
  properties: {
    schemaVersion: { type: "string", const: "invoice-proposal-v1" },
    header: {
      type: "object",
      additionalProperties: false,
      required: [
        "vendorName", "invoiceNumber", "invoiceDate", "currency",
        "subtotal", "tax", "freight", "total",
      ],
      properties: Object.fromEntries(
        ["vendorName", "invoiceNumber", "invoiceDate", "currency", "subtotal", "tax", "freight", "total"]
          .map((key) => [key, nullableObservedValue]),
      ),
    },
    lines: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "vendorPartNumber", "quantity", "unitCost", "lineTotal", "classification"],
        properties: {
          description: nullableObservedValue,
          vendorPartNumber: nullableObservedValue,
          quantity: nullableObservedValue,
          unitCost: nullableObservedValue,
          lineTotal: nullableObservedValue,
          classification: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "confidence"],
                properties: {
                  kind: { type: "string", enum: ["inventory", "consumable", "service", "adjustment", "unknown"] },
                  confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
                },
              },
              { type: "null" },
            ],
          },
        },
      },
    },
    uncertainties: {
      type: "array",
      maxItems: 1000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "reason", "message"],
        properties: {
          path: { type: "string" },
          reason: { type: "string", enum: ["missing", "ambiguous", "low_confidence", "inconsistent"] },
          message: { type: "string" },
        },
      },
    },
  },
} as const;

function completedProposal(outputText: string): InvoiceProposal | null {
  try {
    return reconcileInvoiceDescriptions(
      invoiceProposalSchema.parse(JSON.parse(outputText)),
    );
  } catch {
    return null;
  }
}

export function buildInvoiceExtractionInstructions(
  sourceAssetIds: readonly string[],
): string {
  return `Extract only values visible in the supplied invoice. Use null for anything not present. Do not infer or fabricate part numbers, quantities, prices, dates, or totals. Examine every supplied page before producing the final result. If no invoice number is present but the document clearly displays a labeled quote number, order number, ticket number, or equivalent transaction reference, return that visible reference in header.invoiceNumber and add an ambiguity uncertainty explaining the original label. Do not invent a fallback reference. A multi-page file may repeat the same item on a quote, order, invoice, or parts ticket. Consolidate repeated occurrences by exact vendor part reference: keep quantities and prices from the authoritative transaction page, but use the longest complete visible description from any page whose reference and commercial values match. Do not return a visibly truncated description when another page shows the complete description for that exact reference. Preserve the chosen description's source page and asset provenance. Preserve visible negative quantities and amounts. Classify clearly identified labor, installation, repair work, service fees, and other non-physical work as service. Service lines remain part of invoice totals but never represent stock. For ambiguous lines such as shop supplies, return unknown so a user must choose inventory, consumable, or service during review. Do not classify physical products from product-specific keywords when the evidence is ambiguous. Treat a quantity-bearing return or exchange as a financial adjustment only when the document contains an opposite-sign line for the same vendor part reference and product description; otherwise classify it as unknown for human review. Return confidence only when supported by the document and list every ambiguity. Provenance sourceAssetId must be one of these opaque identifiers or null: ${sourceAssetIds.join(", ")}.`;
}

export class OpenAIInvoiceProvider implements InvoiceExtractionProviderPort {
  readonly name = "openai" as const;
  private readonly client: OpenAI | null;

  constructor(
    apiKey: string | undefined,
    private readonly webhookSecret: string | undefined,
  ) {
    this.client = apiKey
      ? new OpenAI({ apiKey, maxRetries: 2, timeout: 60_000 })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async submit(request: InvoiceProviderRequest): Promise<InvoiceProviderResult> {
    if (!this.client) {
      return { status: "failed", responseId: null, failureCode: "PROVIDER_FAILED" };
    }
    const content: OpenAI.Responses.ResponseInputContent[] = [
      {
        type: "input_text",
        text: buildInvoiceExtractionInstructions(
          request.assets.map((asset) => asset.id),
        ),
      },
      ...request.assets.map((asset): OpenAI.Responses.ResponseInputContent =>
        asset.mimeType === "application/pdf"
          ? {
              type: "input_file",
              filename: asset.displayName,
              file_data: `data:${asset.mimeType};base64,${asset.bytes.toString("base64")}`,
              detail: "high",
            }
          : {
              type: "input_image",
              image_url: `data:${asset.mimeType};base64,${asset.bytes.toString("base64")}`,
              detail: "high",
            },
      ),
    ];
    const response = await this.client.responses.create({
      model: request.model,
      reasoning: { effort: request.reasoningEffort },
      background: request.background,
      store: request.storeResponse,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "invoice_proposal_v1",
          strict: true,
          schema: invoiceProposalJsonSchema,
        },
      },
    });
    return this.mapResponse(response);
  }

  async retrieve(responseId: string): Promise<InvoiceProviderResult> {
    if (!this.client) {
      return { status: "failed", responseId, failureCode: "PROVIDER_FAILED" };
    }
    return this.mapResponse(await this.client.responses.retrieve(responseId));
  }

  async unwrapWebhook(
    rawBody: string,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): Promise<{ eventId: string; eventType: string; responseId: string }> {
    if (!this.client || !this.webhookSecret) {
      throw new Error("OpenAI webhook verification is not configured");
    }
    const event = await this.client.webhooks.unwrap(
      rawBody,
      headers,
      this.webhookSecret,
    );
    if (!event.type.startsWith("response.") || !("id" in event.data)) {
      throw new Error("Unsupported OpenAI webhook event");
    }
    return {
      eventId: event.id,
      eventType: event.type,
      responseId: event.data.id,
    };
  }

  private mapResponse(response: OpenAI.Responses.Response): InvoiceProviderResult {
    if (response.status === "queued" || response.status === "in_progress") {
      return { status: "pending", responseId: response.id };
    }
    if (response.status === "completed") {
      const proposal = completedProposal(response.output_text ?? "");
      return proposal
        ? { status: "completed", responseId: response.id, proposal }
        : {
            status: "failed",
            responseId: response.id,
            failureCode: response.output_text
              ? "PROVIDER_INVALID_OUTPUT"
              : "PROVIDER_REFUSAL",
          };
    }
    return {
      status: "failed",
      responseId: response.id,
      failureCode:
        response.status === "incomplete"
          ? "PROVIDER_INCOMPLETE"
          : "PROVIDER_FAILED",
    };
  }
}
