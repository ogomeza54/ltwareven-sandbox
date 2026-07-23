import assert from "node:assert/strict";
import test from "node:test";
import express, { type Request, type Response } from "express";
import multer from "multer";
import {
  expectedInvoiceDraftRevision,
  invoiceUploadShapeLimits,
  registerInvoiceAssetRoutes,
  requireInvoiceSameOrigin,
} from "../../modules/invoice-extraction/http/invoice-asset-routes";
import type { InvoiceAssetService } from "../../modules/invoice-extraction/services/invoice-asset-service";

test("multipart parser accepts the single invoice file part", async () => {
  const app = express();
  app.post(
    "/upload",
    multer({
      storage: multer.memoryStorage(),
      limits: invoiceUploadShapeLimits,
    }).single("file"),
    (request, response) => {
      response.json({ size: request.file?.size ?? 0 });
    },
  );
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("%PDF-1.4\n%%EOF\n"))], {
        type: "application/pdf",
      }),
      "invoice.pdf",
    );
    const response = await fetch(
      `http://127.0.0.1:${address.port}/upload`,
      { method: "POST", body: form },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { size: 15 });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("asset mutations authenticate and resolve tenant before parsing multipart", () => {
  const app = express();
  registerInvoiceAssetRoutes(app, {} as InvoiceAssetService);
  const route = (
    app as unknown as {
      _router: {
        stack: Array<{
          route?: {
            path: string;
            methods: Record<string, boolean>;
            stack: Array<{ handle: { name: string } }>;
          };
        }>;
      };
    }
  )._router.stack
    .map((layer) => layer.route)
    .find(
      (candidate) =>
        candidate?.path === "/api/invoice-drafts/:draftId/assets" &&
        candidate.methods.post,
    );
  assert.ok(route);
  assert.deepEqual(
    route.stack.slice(0, 3).map((layer) => layer.handle.name),
    ["isAuthenticated", "withCompanyContext", "requireInvoiceSameOrigin"],
  );
});

test("asset mutation revision accepts only a quoted nonnegative integer", () => {
  const request = (value?: string) =>
    ({
      header(name: string) {
        return name === "if-match" ? value : undefined;
      },
    }) as Request;
  assert.equal(expectedInvoiceDraftRevision(request('"12"')), 12);
  for (const value of [
    undefined,
    "12",
    '"-1"',
    '"1.2"',
    '"1" trailing',
    '"9007199254740993"',
    '"2147483648"',
  ]) {
    assert.throws(() => expectedInvoiceDraftRevision(request(value)));
  }
});

test("same-origin middleware rejects missing or mismatched origins", () => {
  const invoke = (origin?: string) => {
    let status = 200;
    let body: unknown;
    let nextCalled = false;
    const request = {
      protocol: "https",
      header(name: string) {
        return name === "origin" ? origin : undefined;
      },
      get(name: string) {
        return name === "host" ? "haulmaster.local" : undefined;
      },
    } as Request;
    const response = {
      status(value: number) {
        status = value;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    } as unknown as Response;
    requireInvoiceSameOrigin(request, response, () => {
      nextCalled = true;
    });
    return { status, body, nextCalled };
  };
  assert.equal(invoke("https://haulmaster.local").nextCalled, true);
  assert.equal(invoke().status, 403);
  assert.equal(invoke("https://attacker.invalid").status, 403);
});

test("same-origin middleware normalizes an explicitly configured origin", () => {
  const previous = process.env.INVOICE_ALLOWED_ORIGIN;
  process.env.INVOICE_ALLOWED_ORIGIN = "https://haulmaster.example/path/";
  let nextCalled = false;
  try {
    requireInvoiceSameOrigin(
      {
        header: (name: string) =>
          name === "origin" ? "https://haulmaster.example" : undefined,
      } as Request,
      {} as Response,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(nextCalled, true);
  } finally {
    if (previous === undefined) delete process.env.INVOICE_ALLOWED_ORIGIN;
    else process.env.INVOICE_ALLOWED_ORIGIN = previous;
  }
});
