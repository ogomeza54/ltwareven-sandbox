import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import multer from "multer";
import {
  invoiceAssetIdSchema,
  invoiceAssetOrderSchema,
  invoiceDraftIdSchema,
  InvoiceDomainError,
} from "@shared/invoice-extraction/contracts";
import { invoiceActorFromRequest, withCompanyContext } from "../../../auth-context";
import { isAuthenticated } from "../../../replitAuth";
import { loadInvoiceConfig } from "../config/invoice-config";
import { createPrivateStorage } from "../providers/storage-factory";
import { PostgresInvoiceDocumentRepository } from "../repositories/invoice-document-repository";
import { PostgresInvoiceRepository } from "../repositories/invoice-repository";
import { InvoiceAssetService } from "../services/invoice-asset-service";
import { BoundedSourceDocumentValidator } from "../validation/source-document-validator";

type RequestWithState = Request & {
  requestId?: string;
  invoiceQuarantineRoot?: string;
};

const statusByCode: Readonly<Record<InvoiceDomainError["code"], number>> = {
  INVOICE_INVALID_REQUEST: 400,
  INVOICE_FORBIDDEN: 403,
  INVOICE_FEATURE_DISABLED: 403,
  INVOICE_DRAFT_NOT_FOUND: 404,
  INVOICE_RUN_NOT_FOUND: 404,
  INVOICE_ASSET_NOT_FOUND: 404,
  INVOICE_DRAFT_REVISION_CONFLICT: 409,
  INVOICE_INVALID_STATE: 409,
  INVOICE_LEASE_LOST: 409,
  INVOICE_PROVIDER_RESPONSE_CONFLICT: 409,
  INVOICE_ASSET_ORDER_CONFLICT: 409,
  INVOICE_ASSET_HELD: 409,
  INVOICE_DUPLICATE_SOURCE: 409,
  INVOICE_FILE_TOO_LARGE: 413,
  INVOICE_PAGE_LIMIT: 413,
  INVOICE_FILE_REQUIRED: 400,
  INVOICE_FILE_UNSUPPORTED: 415,
  INVOICE_FILE_INVALID: 422,
  INVOICE_FILE_COMPLEXITY_LIMIT: 422,
  INVOICE_STORAGE_UNAVAILABLE: 503,
};

function requestId(request: RequestWithState): string {
  return request.requestId ?? randomUUID();
}

function sendError(error: unknown, request: RequestWithState, response: Response): void {
  const id = requestId(request);
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    response.status(tooLarge ? 413 : 400).json({
      code: tooLarge ? "INVOICE_FILE_TOO_LARGE" : "INVOICE_INVALID_REQUEST",
      message: tooLarge
        ? "The invoice file exceeds the configured upload limit."
        : "The invoice upload is invalid.",
      requestId: id,
    });
    return;
  }
  if (error instanceof InvoiceDomainError) {
    response.status(statusByCode[error.code]).json({
      code: error.code,
      message: error.message,
      requestId: id,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }
  console.error("Invoice asset request failed", {
    requestId: id,
    errorType: error instanceof Error ? error.name : typeof error,
  });
  response.status(500).json({
    code: "INVOICE_SOURCE_ERROR",
    message: "The invoice source operation could not be completed.",
    requestId: id,
  });
}

export function expectedInvoiceDraftRevision(request: Request): number {
  const value = request.header("if-match");
  const match = value?.match(/^"(\d+)"$/);
  if (!match) throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision > 2_147_483_647) {
    throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
  }
  return revision;
}

async function removeQuarantineRoot(
  root: string,
  requestIdValue?: string,
): Promise<void> {
  for (const delay of [0, 25, 100]) {
    if (delay) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch {
      // Retry without logging the sensitive temporary path.
    }
  }
  console.error("Invoice quarantine cleanup failed", {
    requestId: requestIdValue,
  });
}

export function requireInvoiceSameOrigin(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const config = loadInvoiceConfig();
  const origin = request.header("origin");
  const expected = new URL(
    config.allowedOrigin ??
      `${request.protocol}://${request.get("host") ?? "invalid.local"}`,
  ).origin;
  if (!origin || origin !== expected) {
    sendError(
      new InvoiceDomainError("INVOICE_FORBIDDEN"),
      request as RequestWithState,
      response,
    );
    return;
  }
  next();
}

function runUpload(
  parser: RequestHandler,
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    parser(request, response, (error?: unknown) => {
      if (error) {
        sendError(error, request as RequestWithState, response);
        const root = (request as RequestWithState).invoiceQuarantineRoot;
        if (root) {
          void removeQuarantineRoot(
            root,
            requestId(request as RequestWithState),
          );
        }
        return;
      }
      next();
    });
  };
}

export function registerInvoiceAssetRoutes(
  app: Express,
  service?: InvoiceAssetService,
): void {
  const config = loadInvoiceConfig();
  const assetService =
    service ??
    new InvoiceAssetService(
      new PostgresInvoiceDocumentRepository(),
      new PostgresInvoiceRepository(),
      createPrivateStorage(config),
      new BoundedSourceDocumentValidator(config),
      config,
    );
  const upload = multer({
    storage: multer.diskStorage({
      destination: async (request, _file, callback) => {
        try {
          const root = await mkdtemp(join(tmpdir(), "invoice-quarantine-"));
          (request as RequestWithState).invoiceQuarantineRoot = root;
          callback(null, root);
        } catch (error) {
          callback(error as Error, "");
        }
      },
      filename: (_request, _file, callback) =>
        callback(null, randomUUID()),
    }),
    limits: {
      fileSize: config.maxFileBytes,
      files: 1,
      fields: 0,
      parts: 1,
    },
  }).single("file");

  app.post(
    "/api/invoice-drafts/:draftId/assets",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    runUpload(upload),
    async (request: RequestWithState, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        if (!draftId.success) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
        if (!request.file) throw new InvoiceDomainError("INVOICE_FILE_REQUIRED");
        const result = await assetService.upload({
          actor: invoiceActorFromRequest(request),
          draftId: draftId.data,
          expectedRevision: expectedInvoiceDraftRevision(request),
          filename: request.file.path,
          displayName: request.file.originalname,
          requestId: requestId(request),
        });
        response.status(202).json(result);
      } catch (error) {
        sendError(error, request, response);
      } finally {
        if (request.invoiceQuarantineRoot) {
          await removeQuarantineRoot(
            request.invoiceQuarantineRoot,
            requestId(request),
          );
        }
      }
    },
  );

  app.get(
    "/api/invoice-drafts/:draftId/assets/:assetId",
    isAuthenticated,
    withCompanyContext,
    async (request: RequestWithState, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const assetId = invoiceAssetIdSchema.safeParse(request.params.assetId);
        if (!draftId.success || !assetId.success) {
          throw new InvoiceDomainError("INVOICE_ASSET_NOT_FOUND");
        }
        const asset = await assetService.open(
          invoiceActorFromRequest(request),
          draftId.data,
          assetId.data,
          requestId(request),
        );
        response.setHeader("Content-Type", asset.detectedType);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader(
          "Content-Disposition",
          'inline; filename="invoice-source"',
        );
        asset.stream.once("error", () => {
          if (!response.headersSent) {
            sendError(
              new InvoiceDomainError("INVOICE_STORAGE_UNAVAILABLE"),
              request,
              response,
            );
          } else {
            response.destroy();
          }
        });
        response.once("close", () => {
          if (!asset.stream.readableEnded) asset.stream.destroy();
        });
        asset.stream.pipe(response);
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.delete(
    "/api/invoice-drafts/:draftId/assets/:assetId",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request: RequestWithState, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const assetId = invoiceAssetIdSchema.safeParse(request.params.assetId);
        if (!draftId.success || !assetId.success) {
          throw new InvoiceDomainError("INVOICE_ASSET_NOT_FOUND");
        }
        response.json(
          await assetService.delete({
            actor: invoiceActorFromRequest(request),
            draftId: draftId.data,
            assetId: assetId.data,
            expectedRevision: expectedInvoiceDraftRevision(request),
            requestId: requestId(request),
          }),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );

  app.patch(
    "/api/invoice-drafts/:draftId/assets/order",
    isAuthenticated,
    withCompanyContext,
    requireInvoiceSameOrigin,
    async (request: RequestWithState, response) => {
      try {
        const draftId = invoiceDraftIdSchema.safeParse(request.params.draftId);
        const order = invoiceAssetOrderSchema.safeParse(request.body);
        if (!draftId.success || !order.success) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
        response.json(
          await assetService.reorder({
            actor: invoiceActorFromRequest(request),
            draftId: draftId.data,
            expectedRevision: expectedInvoiceDraftRevision(request),
            assetIds: order.data.assetIds,
            requestId: requestId(request),
          }),
        );
      } catch (error) {
        sendError(error, request, response);
      }
    },
  );
}
