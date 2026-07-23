import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  InvoiceDomainError,
  invoiceDraftIdSchema,
  rejectInvoiceReviewSchema,
  updateInvoiceHeaderReviewSchema,
  updateInvoiceLineMatchesSchema,
  updateInvoiceLinesReviewSchema,
} from "@shared/invoice-extraction/contracts";
import { isAuthenticated } from "../../../replitAuth";
import {
  invoiceActorFromRequest,
  withCompanyContext,
} from "../../../auth-context";
import { InvoiceHeaderReviewService } from "../services/invoice-header-review-service";
import { InvoiceLineReviewService } from "../services/invoice-line-review-service";
import { InvoicePartMatchService } from "../services/invoice-part-match-service";
import { requireInvoiceSameOrigin } from "./invoice-asset-routes";

type RequestWithId = Request & { requestId?: string };

function sendError(error: unknown, request: RequestWithId, response: Response): void {
  const requestId = request.requestId ?? randomUUID();
  if (error instanceof InvoiceDomainError) {
    const status =
      error.code === "INVOICE_DRAFT_NOT_FOUND"
        ? 404
        : error.code === "INVOICE_FORBIDDEN"
          ? 403
          : error.code === "INVOICE_DRAFT_REVISION_CONFLICT" ||
              error.code === "INVOICE_INVALID_STATE"
              || error.code === "INVOICE_RECONCILIATION_REQUIRED"
            ? 409
            : 400;
    response.status(status).json({
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }
  response.status(500).json({
    code: "INVOICE_REVIEW_ERROR",
    message: "The invoice review could not be completed.",
    requestId,
  });
}

export function registerInvoiceReviewRoutes(
  app: Express,
  service = new InvoiceHeaderReviewService(),
  lineService = new InvoiceLineReviewService(),
  matchService = new InvoicePartMatchService(),
): void {
  app.get(
    "/api/invoice-drafts/:draftId/review",
    isAuthenticated,
    withCompanyContext,
    async (request, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        if (!draftId.success) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
        response.json(
          await service.get(invoiceActorFromRequest(request), draftId.data),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.patch(
    "/api/invoice-drafts/:draftId/review",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const input = updateInvoiceHeaderReviewSchema.safeParse(request.body);
        if (!draftId.success || !input.success) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
        response.json(
          await service.update(
            invoiceActorFromRequest(request),
            draftId.data,
            input.data,
            (request as RequestWithId).requestId,
          ),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.post(
    "/api/invoice-drafts/:draftId/reject",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const input = rejectInvoiceReviewSchema.safeParse(request.body);
        if (!draftId.success || !input.success) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
        response.json(
          await service.reject(
            invoiceActorFromRequest(request),
            draftId.data,
            input.data.revision,
            input.data.reason,
            (request as RequestWithId).requestId,
          ),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.patch(
    "/api/invoice-drafts/:draftId/review/lines",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const input = updateInvoiceLinesReviewSchema.safeParse(request.body);
        if (!draftId.success || !input.success) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
        response.json(
          await lineService.update(
            invoiceActorFromRequest(request),
            draftId.data,
            input.data,
            (request as RequestWithId).requestId,
          ),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.get(
    "/api/invoice-drafts/:draftId/review/lines/:lineId/candidates",
    isAuthenticated,
    withCompanyContext,
    async (request, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const lineId = invoiceDraftIdSchema.safeParse(request.params.lineId);
        if (!draftId.success || !lineId.success) {
          throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
        }
        const query =
          typeof request.query.q === "string"
            ? request.query.q.trim().slice(0, 160)
            : undefined;
        response.json(
          await matchService.candidates(
            invoiceActorFromRequest(request),
            draftId.data,
            lineId.data,
            query,
          ),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.patch(
    "/api/invoice-drafts/:draftId/review/matches",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const input = updateInvoiceLineMatchesSchema.safeParse(request.body);
        if (!draftId.success || !input.success) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
        response.json(
          await matchService.update(
            invoiceActorFromRequest(request),
            draftId.data,
            input.data.revision,
            input.data.matches,
            (request as RequestWithId).requestId,
          ),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );
}
