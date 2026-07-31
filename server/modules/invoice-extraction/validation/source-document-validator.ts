import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { InvoiceDomainError } from "@shared/invoice-extraction/contracts";
import type { InvoiceConfig } from "../config/invoice-config";

export interface ValidatedSourceDocument {
  detectedType:
    | "image/jpeg"
    | "image/png"
    | "image/heic"
    | "image/heif"
    | "application/pdf";
  byteSize: number;
  sha256: string;
  pageCount: number;
}

export interface SourceDocumentValidatorPort {
  validate(filename: string): Promise<ValidatedSourceDocument>;
}

type WorkerResult =
  | { ok: true; detectedType: ValidatedSourceDocument["detectedType"]; pageCount: number }
  | { ok: false; code: "UNSUPPORTED" | "INVALID" | "COMPLEX" };

const workerCode = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const fs = require("node:fs/promises");
  const data = await fs.readFile(workerData.filename);
  const bytes = new Uint8Array(data);
  const ascii = data.toString("latin1");
  const signatures = [
    { kind: "pdf", value: Buffer.from("%PDF-") },
    { kind: "png", value: Buffer.from([137,80,78,71,13,10,26,10]) },
    { kind: "jpeg", value: Buffer.from([255,216,255]) },
  ];
  const starts = signatures.filter((s) => data.subarray(0, s.value.length).equals(s.value));
  if (starts.length > 1) return parentPort.postMessage({ok:false, code:"INVALID"});
  let detectedType;
  let pageCount = 1;
  if (starts[0]?.kind === "jpeg") {
    if (data.indexOf(signatures[0].value, 1) >= 0 || data.indexOf(signatures[1].value, 1) >= 0) {
      return parentPort.postMessage({ok:false, code:"INVALID"});
    }
    if (data.length < 4 || data[data.length - 2] !== 255 || data[data.length - 1] !== 217) {
      return parentPort.postMessage({ok:false, code:"INVALID"});
    }
    const sharp = (await import("sharp")).default;
    const meta = await sharp(data, {limitInputPixels: workerData.maxPixels, failOn:"error"}).metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > workerData.maxPixels) {
      return parentPort.postMessage({ok:false, code:"COMPLEX"});
    }
    await sharp(data, {limitInputPixels: workerData.maxPixels, failOn:"error"}).raw().toBuffer();
    detectedType = "image/jpeg";
  } else if (starts[0]?.kind === "png") {
    if (data.indexOf(signatures[0].value, 1) >= 0 || data.indexOf(signatures[2].value, 1) >= 0) {
      return parentPort.postMessage({ok:false, code:"INVALID"});
    }
    const marker = Buffer.from([73,69,78,68,174,66,96,130]);
    if (data.lastIndexOf(marker) !== data.length - marker.length) {
      return parentPort.postMessage({ok:false, code:"INVALID"});
    }
    const sharp = (await import("sharp")).default;
    const meta = await sharp(data, {limitInputPixels: workerData.maxPixels, failOn:"error"}).metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > workerData.maxPixels) {
      return parentPort.postMessage({ok:false, code:"COMPLEX"});
    }
    await sharp(data, {limitInputPixels: workerData.maxPixels, failOn:"error"}).raw().toBuffer();
    detectedType = "image/png";
  } else if (starts[0]?.kind === "pdf") {
    if (data.indexOf(signatures[0].value, signatures[0].value.length) >= 0) {
      return parentPort.postMessage({ok:false, code:"INVALID"});
    }
    const eof = data.lastIndexOf(Buffer.from("%%EOF"));
    if (eof < 0 || data.subarray(eof + 5).toString("latin1").trim() !== "") {
      return parentPort.postMessage({ok:false, code:"INVALID"});
    }
    if (/\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|AcroForm|XFA|RichMedia)\b/i.test(ascii)) {
      return parentPort.postMessage({ok:false, code:"INVALID"});
    }
    if ((ascii.match(/\bobj\b/g) || []).length > 10000 || (ascii.match(/\bstream\b/g) || []).length > 1000) {
      return parentPort.postMessage({ok:false, code:"COMPLEX"});
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: bytes,
      disableEval: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      stopAtErrors: true,
    });
    const document = await task.promise;
    pageCount = document.numPages;
    if (pageCount < 1 || pageCount > workerData.maxPages) {
      await document.destroy();
      return parentPort.postMessage({ok:false, code:"COMPLEX"});
    }
    const attachments = await document.getAttachments();
    const fields = await document.getFieldObjects();
    const scripts = typeof document.getJavaScript === "function"
      ? await document.getJavaScript()
      : null;
    const actions = typeof document.getJSActions === "function"
      ? await document.getJSActions()
      : null;
    const openAction = typeof document.getOpenActionDestination === "function"
      ? await document.getOpenActionDestination()
      : null;
    if (
      (attachments && Object.keys(attachments).length) ||
      (fields && Object.keys(fields).length) ||
      (scripts && scripts.length) ||
      (actions && Object.keys(actions).length) ||
      openAction
    ) {
      await document.destroy();
      return parentPort.postMessage({ok:false, code:"INVALID"});
    }
    for (let index = 1; index <= pageCount; index += 1) {
      const page = await document.getPage(index);
      const pageActions = typeof page.getJSActions === "function"
        ? await page.getJSActions()
        : null;
      if (pageActions && Object.keys(pageActions).length) {
        page.cleanup();
        await document.destroy();
        return parentPort.postMessage({ok:false, code:"INVALID"});
      }
      const annotations = await page.getAnnotations({intent:"display"});
      if (annotations.some((annotation) =>
        annotation.url ||
        annotation.unsafeUrl ||
        annotation.action ||
        annotation.attachment ||
        annotation.file
      )) {
        page.cleanup();
        await document.destroy();
        return parentPort.postMessage({ok:false, code:"INVALID"});
      }
      await page.getOperatorList();
      page.cleanup();
    }
    await document.destroy();
    detectedType = "application/pdf";
  } else if (data.length >= 16 && data.subarray(4, 8).toString("ascii") === "ftyp") {
    let offset = 0;
    while (offset < data.length) {
      if (offset + 8 > data.length) return parentPort.postMessage({ok:false, code:"INVALID"});
      let size = data.readUInt32BE(offset);
      const type = data.subarray(offset + 4, offset + 8).toString("ascii");
      if (size === 1) {
        if (offset + 16 > data.length) return parentPort.postMessage({ok:false, code:"INVALID"});
        const large = Number(data.readBigUInt64BE(offset + 8));
        if (!Number.isSafeInteger(large)) return parentPort.postMessage({ok:false, code:"COMPLEX"});
        size = large;
      } else if (size === 0) {
        size = data.length - offset;
      }
      if (size < 8 || offset + size > data.length) return parentPort.postMessage({ok:false, code:"INVALID"});
      if (!/^[\x20-\x7e]{4}$/.test(type)) return parentPort.postMessage({ok:false, code:"INVALID"});
      offset += size;
    }
    if (offset !== data.length) return parentPort.postMessage({ok:false, code:"INVALID"});
    const brands = data.subarray(8, Math.min(data.length, 40)).toString("ascii");
    const heif = /\b(mif1|msf1|heif)\b/.test(brands);
    const heic = /\b(heic|heix|hevc|hevx)\b/.test(brands);
    if (!heif && !heic) return parentPort.postMessage({ok:false, code:"UNSUPPORTED"});
    const decode = (await import("heic-decode")).default;
    const decoded = await decode({buffer: data});
    if (!decoded?.width || !decoded?.height || decoded.width * decoded.height > workerData.maxPixels) {
      return parentPort.postMessage({ok:false, code:"COMPLEX"});
    }
    detectedType = heic ? "image/heic" : "image/heif";
  } else {
    const fileType = await import("file-type");
    const guessed = await fileType.fileTypeFromBuffer(data);
    return parentPort.postMessage({ok:false, code: guessed ? "INVALID" : "UNSUPPORTED"});
  }
  parentPort.postMessage({ok:true, detectedType, pageCount});
})().catch((error) => {
  const name = error && typeof error === "object" ? error.name : "";
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  parentPort.postMessage({
    ok:false,
    code: /pixel limit|memory|too many/i.test(message) ? "COMPLEX" : "INVALID"
  });
});
`;

async function hashFile(filename: string): Promise<{ sha256: string; byteSize: number }> {
  const hash = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of createReadStream(filename)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteSize += buffer.length;
    hash.update(buffer);
  }
  return { sha256: hash.digest("hex"), byteSize };
}

export class BoundedSourceDocumentValidator
  implements SourceDocumentValidatorPort
{
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly config: InvoiceConfig) {}

  private async acquire(): Promise<void> {
    if (this.active < this.config.validationConcurrency) {
      this.active += 1;
      return;
    }
    if (this.waiting.length >= this.config.validationConcurrency * 4) {
      throw new InvoiceDomainError("INVOICE_STORAGE_UNAVAILABLE");
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }

  async validate(filename: string): Promise<ValidatedSourceDocument> {
    await this.acquire();
    try {
      const measured = await hashFile(filename);
      if (measured.byteSize < 1) {
        throw new InvoiceDomainError("INVOICE_FILE_INVALID");
      }
      if (measured.byteSize > this.config.maxFileBytes) {
        throw new InvoiceDomainError("INVOICE_FILE_TOO_LARGE");
      }
      const result = await new Promise<WorkerResult>((resolve, reject) => {
        let settled = false;
        const worker = new Worker(workerCode, {
          eval: true,
          resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 },
          workerData: {
            filename,
            maxPixels: this.config.maxImagePixels,
            maxPages: this.config.maxSourcePages,
          },
        });
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          void worker.terminate().then(() =>
            reject(new InvoiceDomainError("INVOICE_FILE_COMPLEXITY_LIMIT")),
          );
        }, this.config.validationTimeoutMs);
        worker.once("message", (value: WorkerResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          void worker.terminate();
          resolve(value);
        });
        worker.once("error", (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        });
        worker.once("exit", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Invoice validation worker exited (${code})`));
        });
      });
      if (!result.ok) {
        throw new InvoiceDomainError(
          result.code === "UNSUPPORTED"
            ? "INVOICE_FILE_UNSUPPORTED"
            : result.code === "COMPLEX"
              ? "INVOICE_FILE_COMPLEXITY_LIMIT"
              : "INVOICE_FILE_INVALID",
        );
      }
      return { ...measured, ...result };
    } finally {
      this.release();
    }
  }
}

export async function removeQuarantineFile(filename: string): Promise<void> {
  await rm(filename, { force: true }).catch(() => undefined);
}
