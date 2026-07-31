import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  InvoiceDomainError,
  invoiceDraftIdSchema,
  invoiceRunIdSchema,
  startInvoiceExtractionSchema,
} from "@shared/invoice-extraction/contracts";
import { isAuthenticated } from "../../../replitAuth";
import {
  invoiceActorFromRequest,
  withCompanyContext,
} from "../../../auth-context";
import {
  getInvoiceExtractionService,
  type InvoiceExtractionService,
  wakeInvoiceExtractionWorker,
} from "../services/invoice-extraction-service";
import { requireInvoiceSameOrigin } from "./invoice-asset-routes";

type RequestWithRaw = Request & { requestId?: string; rawBody?: string };

const statusByCode: Partial<Record<InvoiceDomainError["code"], number>> = {
  INVOICE_INVALID_REQUEST: 400,
  INVOICE_FORBIDDEN: 403,
  INVOICE_FEATURE_DISABLED: 403,
  INVOICE_DRAFT_NOT_FOUND: 404,
  INVOICE_RUN_NOT_FOUND: 404,
  INVOICE_DRAFT_REVISION_CONFLICT: 409,
  INVOICE_INVALID_STATE: 409,
  INVOICE_SOURCE_REQUIRED: 409,
  INVOICE_PROVIDER_UNAVAILABLE: 503,
  INVOICE_PROVIDER_INVALID_OUTPUT: 422,
  INVOICE_WEBHOOK_INVALID: 401,
};

function sendError(error: unknown, request: RequestWithRaw, response: Response): void {
  const requestId = request.requestId ?? randomUUID();
  if (error instanceof InvoiceDomainError) {
    response.status(statusByCode[error.code] ?? 500).json({
      code: error.code,
      message: error.message,
      requestId,
    });
    return;
  }
  response.status(500).json({
    code: "INVOICE_EXTRACTION_ERROR",
    message: "Invoice extraction could not be completed.",
    requestId,
  });
}

export function registerInvoiceExtractionRoutes(
  app: Express,
  service: InvoiceExtractionService = getInvoiceExtractionService(),
): void {
  app.post(
    "/api/invoice-drafts/:draftId/extraction-runs",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const command = startInvoiceExtractionSchema.safeParse(request.body);
        if (!draftId.success || !command.success) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
        const run = await service.start(
          invoiceActorFromRequest(request),
          draftId.data,
          command.data.revision,
          (request as RequestWithRaw).requestId,
        );
        response.status(202).json(run);
        wakeInvoiceExtractionWorker();
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.get(
    "/api/invoice-extraction-runs/:runId",
    isAuthenticated,
    withCompanyContext,
    async (request, response) => {
      try {
        const runId = invoiceRunIdSchema.safeParse(request.params.runId);
        if (!runId.success) throw new InvoiceDomainError("INVOICE_RUN_NOT_FOUND");
        response.json(
          await service.get(invoiceActorFromRequest(request), runId.data),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.post(
    "/api/invoice-extraction/webhooks/openai",
    async (request: RequestWithRaw, response) => {
      try {
        if (typeof request.rawBody !== "string") {
          throw new InvoiceDomainError("INVOICE_WEBHOOK_INVALID");
        }
        const headers = Object.fromEntries(
          Object.entries(request.headers).map(([key, value]) => [key, value]),
        );
        const receipt = await service.receiveWebhook(request.rawBody, headers);
        response.status(202).json({ accepted: true });
        if (receipt.accepted) {
          void service.reconcileWebhook(receipt.eventId, receipt.responseId);
        }
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );
}
