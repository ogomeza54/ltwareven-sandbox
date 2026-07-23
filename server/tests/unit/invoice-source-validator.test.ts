import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { InvoiceDomainError } from "@shared/invoice-extraction/contracts";
import { loadInvoiceConfig } from "../../modules/invoice-extraction/config/invoice-config";
import { BoundedSourceDocumentValidator } from "../../modules/invoice-extraction/validation/source-document-validator";

const validator = new BoundedSourceDocumentValidator(
  loadInvoiceConfig({
    NODE_ENV: "test",
    INVOICE_VALIDATION_TIMEOUT_MS: "10000",
  }),
);

const syntheticHeic = Buffer.from(
  "AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABw21ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABFeGlmAAAAABppcmVmAAAAAAAAAA5jZHNjAAIAAQABAAAA5mlwcnAAAADFaXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAAQAAAAEAAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgAAABxaHZjQwEDcAAAALAAAAAAAB7wAPz9+PgAAAsDoAABABdAAQwB//8DcAAAAwCwAAADAAADAB5wJKEAAQAjQgEBA3AAAAMAsAAAAwAAAwAeoBQgQcCTDOIe5FlU3AgIGAKiAAEACUQBwGFyyERTZAAAABlpcG1hAAAAAAAAAAEAAQaBAgOEBYYAAAAsaWxvYwAAAABEAAACAAEAAAABAAACQwAAACsAAgAAAAEAAAH3AAAATAAAAAFtZGF0AAAAAAAAAIcAAAAGRXhpZgAATU0AKgAAAAgAAwEaAAUAAAABAAAAMgEbAAUAAAABAAAAOgEoAAMAAAABAAIAAAAAAAAAAAAZAAAAAQAAABkAAAABAAAAJygBr6LGR+xl1b8uRNoh//6e1qjjmV/QIjrYf/2IsmbURpD49Aj+bA==",
  "base64",
);

function minimalPdf(pageCount: number, headerComment = ""): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from(
      { length: pageCount },
      (_, index) => `${index + 3} 0 R`,
    ).join(" ")}] >>`,
    ...Array.from(
      { length: pageCount },
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>",
    ),
  ];
  let body = `%PDF-1.4\n${headerComment}`;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

function escapedActivePdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /#4fpenAction 4 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>",
    "<< /S /#4aavaScript /JS (app.alert\\(1\\)) >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

function uriAnnotationPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Annots [4 0 R] >>",
    "<< /Type /Annot /Subtype /Link /Rect [0 0 1 1] /A << /S /URI /URI (https://example.invalid) >> >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function withFixture(
  bytes: Buffer,
  run: (filename: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "invoice-validator-test-"));
  const filename = join(root, "source");
  try {
    await writeFile(filename, bytes);
    await run(filename);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("bounded validator decodes JPEG and PNG by content", async () => {
  const jpeg = await sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();
  const png = await sharp(jpeg).png().toBuffer();
  await withFixture(jpeg, async (filename) => {
    const result = await validator.validate(filename);
    assert.equal(result.detectedType, "image/jpeg");
    assert.equal(result.pageCount, 1);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
  });
  await withFixture(png, async (filename) => {
    const result = await validator.validate(filename);
    assert.equal(result.detectedType, "image/png");
    assert.equal(result.pageCount, 1);
  });
});

test("bounded validator decodes synthetic HEIC in the worker", async () => {
  await withFixture(syntheticHeic, async (filename) => {
    const result = await validator.validate(filename);
    assert.equal(result.detectedType, "image/heic");
    assert.equal(result.pageCount, 1);
  });
});

test("bounded validator parses PDF pages and enforces the page cap", async () => {
  for (const pages of [1, 10]) {
    await withFixture(minimalPdf(pages), async (filename) => {
      const result = await validator.validate(filename);
      assert.equal(result.detectedType, "application/pdf");
      assert.equal(result.pageCount, pages);
    });
  }
  await withFixture(minimalPdf(11), async (filename) => {
    await assert.rejects(
      () => validator.validate(filename),
      (error) =>
        error instanceof InvoiceDomainError &&
        error.code === "INVOICE_FILE_COMPLEXITY_LIMIT",
    );
  });
});

test("bounded validator accepts image signatures embedded in a scanned PDF", async () => {
  const marker = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const scannedPdf = minimalPdf(
    1,
    `% embedded scan marker: ${marker.toString("latin1")}\n`,
  );
  await withFixture(scannedPdf, async (filename) => {
    const result = await validator.validate(filename);
    assert.equal(result.detectedType, "application/pdf");
    assert.equal(result.pageCount, 1);
  });
});

test("bounded validator rejects truncated, polyglot and unsupported bytes", async () => {
  const jpeg = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: "white",
    },
  })
    .jpeg()
    .toBuffer();
  for (const bytes of [
    jpeg.subarray(0, jpeg.length - 2),
    Buffer.concat([jpeg, Buffer.from("%PDF-1.7")]),
    Buffer.from("not an invoice"),
  ]) {
    await withFixture(bytes, async (filename) => {
      await assert.rejects(
        () => validator.validate(filename),
        (error) =>
          error instanceof InvoiceDomainError &&
          ["INVOICE_FILE_INVALID", "INVOICE_FILE_UNSUPPORTED"].includes(
            error.code,
          ),
      );
    });
  }
});

test("bounded validator rejects active PDF before parsing", async () => {
  const active = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /OpenAction 2 0 R >>\nendobj\n%%EOF\n",
  );
  await withFixture(active, async (filename) => {
    await assert.rejects(
      () => validator.validate(filename),
      (error) =>
        error instanceof InvoiceDomainError &&
        error.code === "INVOICE_FILE_INVALID",
    );
  });
});

test("bounded validator rejects escaped PDF JavaScript after structural parsing", async () => {
  await withFixture(escapedActivePdf(), async (filename) => {
    await assert.rejects(
      () => validator.validate(filename),
      (error) =>
        error instanceof InvoiceDomainError &&
        error.code === "INVOICE_FILE_INVALID",
    );
  });
});

test("bounded validator rejects active URI annotations", async () => {
  await withFixture(uriAnnotationPdf(), async (filename) => {
    await assert.rejects(
      () => validator.validate(filename),
      (error) =>
        error instanceof InvoiceDomainError &&
        error.code === "INVOICE_FILE_INVALID",
    );
  });
});

test("bounded validator rejects pixel bombs before full decode", async () => {
  const png = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: "white",
    },
  })
    .png()
    .toBuffer();
  png.writeUInt32BE(100_000, 16);
  png.writeUInt32BE(100_000, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  await withFixture(png, async (filename) => {
    await assert.rejects(
      () => validator.validate(filename),
      (error) =>
        error instanceof InvoiceDomainError &&
        error.code === "INVOICE_FILE_COMPLEXITY_LIMIT",
    );
  });
});

test("bounded validator terminates work at the configured deadline", async () => {
  const impatient = new BoundedSourceDocumentValidator(
    loadInvoiceConfig({
      NODE_ENV: "test",
      INVOICE_VALIDATION_TIMEOUT_MS: "1",
    }),
  );
  await withFixture(minimalPdf(10), async (filename) => {
    await assert.rejects(
      () => impatient.validate(filename),
      (error) =>
        error instanceof InvoiceDomainError &&
        error.code === "INVOICE_FILE_COMPLEXITY_LIMIT",
    );
  });
});
