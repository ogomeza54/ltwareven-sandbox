import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  InvoiceDomainError,
  activateInvoiceEngineSchema,
  createInvoiceEvaluationSetSchema,
  invoiceDraftIdSchema,
  registerInvoiceEngineSchema,
  runInvoiceEvaluationSchema,
} from "@shared/invoice-extraction/contracts";
import { invoiceActorFromRequest, withCompanyContext } from "../../../auth-context";
import { isAuthenticated } from "../../../replitAuth";
import { InvoiceEvaluationService } from "../services/invoice-evaluation-service";
import { requireInvoiceSameOrigin } from "./invoice-asset-routes";

type RequestWithId = Request & { requestId?: string };

function sendError(error: unknown, request: RequestWithId, response: Response): void {
  const requestId = request.requestId ?? randomUUID();
  if (error instanceof InvoiceDomainError) {
    response.status(error.code === "INVOICE_FORBIDDEN" ? 403 : 400).json({
      code: error.code,
      message: error.message,
      requestId,
    });
    return;
  }
  response.status(500).json({
    code: "INVOICE_EVALUATION_ERROR",
    message: "The invoice evaluation operation could not be completed.",
    requestId,
  });
}

export function registerInvoiceEvaluationRoutes(
  app: Express,
  service = new InvoiceEvaluationService(),
): void {
  app.post(
    "/api/invoice-engines",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const input = registerInvoiceEngineSchema.safeParse(request.body);
        if (!input.success) throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        response.status(201).json(
          await service.registerEngine(invoiceActorFromRequest(request), input.data),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );
  app.post(
    "/api/invoice-evaluation-sets",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const input = createInvoiceEvaluationSetSchema.safeParse(request.body);
        if (!input.success) throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        response.status(201).json(
          await service.createSet(invoiceActorFromRequest(request), input.data),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );
  app.post(
    "/api/invoice-evaluation-runs",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const input = runInvoiceEvaluationSchema.safeParse(request.body);
        if (!input.success) throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        response.status(201).json(
          await service.run(invoiceActorFromRequest(request), input.data),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );
  app.get(
    "/api/invoice-evaluation-sets/:setId/comparisons",
    isAuthenticated,
    withCompanyContext,
    async (request, response) => {
      try {
        const setId = invoiceDraftIdSchema.safeParse(request.params.setId);
        if (!setId.success) throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        response.json(
          await service.comparisons(invoiceActorFromRequest(request), setId.data),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );
  app.post(
    "/api/invoice-engine-activation",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request, response) => {
      try {
        const input = activateInvoiceEngineSchema.safeParse(request.body);
        if (!input.success) throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        response.json(
          await service.activate(
            invoiceActorFromRequest(request),
            input.data,
            (request as RequestWithId).requestId,
          ),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );
}
