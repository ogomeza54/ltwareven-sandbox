import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  createInvoiceDraftSchema,
  invoiceDraftIdSchema,
  InvoiceDomainError,
} from "@shared/invoice-extraction/contracts";
import { isAuthenticated } from "../../../replitAuth";
import {
  invoiceActorFromRequest,
  withCompanyContext,
} from "../../../auth-context";
import { PostgresInvoiceRepository } from "../repositories/invoice-repository";
import { PostgresInvoiceDocumentRepository } from "../repositories/invoice-document-repository";
import { InvoiceDraftService } from "../services/invoice-draft-service";
import { requireInvoiceSameOrigin } from "./invoice-asset-routes";

type RequestWithId = Request & { requestId?: string };

const statusByCode: Readonly<Record<InvoiceDomainError["code"], number>> = {
  INVOICE_INVALID_REQUEST: 400,
  INVOICE_FORBIDDEN: 403,
  INVOICE_FEATURE_DISABLED: 403,
  INVOICE_DRAFT_NOT_FOUND: 404,
  INVOICE_RUN_NOT_FOUND: 404,
  INVOICE_DRAFT_REVISION_CONFLICT: 409,
  INVOICE_INVALID_STATE: 409,
  INVOICE_LEASE_LOST: 409,
  INVOICE_PROVIDER_RESPONSE_CONFLICT: 409,
  INVOICE_ASSET_NOT_FOUND: 404,
  INVOICE_FILE_REQUIRED: 400,
  INVOICE_FILE_TOO_LARGE: 413,
  INVOICE_FILE_UNSUPPORTED: 415,
  INVOICE_FILE_INVALID: 422,
  INVOICE_FILE_COMPLEXITY_LIMIT: 422,
  INVOICE_PAGE_LIMIT: 413,
  INVOICE_ASSET_ORDER_CONFLICT: 409,
  INVOICE_STORAGE_UNAVAILABLE: 503,
  INVOICE_ASSET_HELD: 409,
  INVOICE_DUPLICATE_SOURCE: 409,
};

function requestId(req: RequestWithId): string {
  return req.requestId ?? randomUUID();
}

function sendInvoiceError(
  error: unknown,
  req: RequestWithId,
  res: Response,
): void {
  const id = requestId(req);
  if (error instanceof InvoiceDomainError) {
    res.status(statusByCode[error.code]).json({
      code: error.code,
      message: error.message,
      requestId: id,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }
  console.error("Invoice request failed", {
    requestId: id,
    errorType: error instanceof Error ? error.name : typeof error,
  });
  res.status(500).json({
    code: "INVOICE_LEDGER_ERROR",
    message: "The invoice ledger operation could not be completed.",
    requestId: id,
  });
}

export function registerInvoiceDraftRoutes(
  app: Express,
  service = new InvoiceDraftService(
    new PostgresInvoiceRepository(),
    new PostgresInvoiceDocumentRepository(),
  ),
): void {
  app.post(
    "/api/invoice-drafts",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        if (!createInvoiceDraftSchema.safeParse(request.body ?? {}).success) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
        const draft = await service.create(
          invoiceActorFromRequest(request),
          requestId(request),
        );
        response.status(201).json(draft);
      } catch (error) {
        sendInvoiceError(error, request, response);
      }
    },
  );

  app.get(
    "/api/invoice-drafts",
    isAuthenticated,
    withCompanyContext,
    async (request, response) => {
      try {
        response.json(await service.list(invoiceActorFromRequest(request)));
      } catch (error) {
        sendInvoiceError(error, request, response);
      }
    },
  );

  app.get(
    "/api/invoice-drafts/:draftId",
    isAuthenticated,
    withCompanyContext,
    async (request, response) => {
      try {
        const parsed = invoiceDraftIdSchema.safeParse(request.params.draftId);
        if (!parsed.success) {
          throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
        }
        response.json(
          await service.get(invoiceActorFromRequest(request), parsed.data),
        );
      } catch (error) {
        sendInvoiceError(error, request, response);
      }
    },
  );
}
