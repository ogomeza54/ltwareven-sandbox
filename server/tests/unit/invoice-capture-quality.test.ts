import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeInvoiceFile,
  analyzeCapturePixels,
  MAX_CAPTURE_ANALYSIS_PIXELS,
  readRasterDimensions,
  replacePendingCapture,
} from "../../../client/src/features/invoice-extraction/capture-quality";

function pixels(
  width: number,
  height: number,
  value: (x: number, y: number) => number,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      result[offset] = result[offset + 1] = result[offset + 2] = value(x, y);
      result[offset + 3] = 255;
    }
  }
  return result;
}

function codes(result: ReturnType<typeof analyzeCapturePixels>): string[] {
  return result.status === "available"
    ? result.warnings.map((warning) => warning.code)
    : [];
}

test("quality analysis reports deterministic strong signals without a score", () => {
  const dark = analyzeCapturePixels(pixels(20, 20, () => 20), 20, 20, 1600, 2200);
  assert.deepEqual(codes(dark), ["dark", "low-contrast"]);

  const lowContrast = analyzeCapturePixels(
    pixels(20, 20, (x) => 120 + (x % 2 ? 5 : -5)),
    20,
    20,
    1600,
    2200,
  );
  assert.deepEqual(codes(lowContrast), ["low-contrast"]);

  const blurred = analyzeCapturePixels(
    pixels(30, 30, (x) => 30 + x * 6),
    30,
    30,
    1600,
    2200,
  );
  assert.deepEqual(codes(blurred), ["blurred"]);
});

test("quality analysis reports dimensions, resolution and cautious orientation", () => {
  const sharp = analyzeCapturePixels(
    pixels(30, 30, (x, y) => ((x + y) % 2 ? 245 : 10)),
    30,
    30,
    800,
    400,
  );
  assert.equal(sharp.status, "available");
  if (sharp.status === "available") {
    assert.deepEqual(
      sharp.warnings.map((warning) => warning.code),
      ["low-resolution", "landscape-orientation"],
    );
    assert.equal("score" in sharp, false);
  }
});

test("quality analysis flags a standard landscape camera frame", () => {
  const landscape = analyzeCapturePixels(
    pixels(40, 30, (x, y) => ((x + y) % 2 ? 245 : 10)),
    40,
    30,
    4032,
    3024,
  );
  assert.deepEqual(codes(landscape), ["landscape-orientation"]);

  const portrait = analyzeCapturePixels(
    pixels(30, 40, (x, y) => ((x + y) % 2 ? 245 : 10)),
    30,
    40,
    3024,
    4032,
  );
  assert.deepEqual(codes(portrait), []);
});

test("quality analysis is bounded and unavailable remains non-blocking", () => {
  const result = analyzeCapturePixels(
    new Uint8ClampedArray(4),
    MAX_CAPTURE_ANALYSIS_PIXELS + 1,
    1,
  );
  assert.equal(result.status, "unavailable");
});

test("PDF quality analysis reports a browser fallback outside the DOM", async () => {
  const result = await analyzeInvoiceFile(
    new File([new Uint8Array([37, 80, 68, 70])], "invoice.pdf", {
      type: "application/pdf",
    }),
  );
  assert.deepEqual(result, {
    status: "unavailable",
    reason:
      "This browser cannot check every page automatically. Review the preview before continuing.",
  });
});

test("image dimensions are read from bounded PNG headers before decoding", () => {
  const header = new Uint8Array(24);
  header.set([0x89, 0x50, 0x4e, 0x47], 0);
  const view = new DataView(header.buffer);
  view.setUint32(16, 3024);
  view.setUint32(20, 4032);
  assert.deepEqual(readRasterDimensions(header), {
    width: 3024,
    height: 4032,
  });
  assert.equal(readRasterDimensions(new Uint8Array([1, 2, 3, 4])), null);
});

test("pending capture replacement revokes every displaced object URL", () => {
  const revoked: string[] = [];
  const first = {
    file: {} as File,
    objectUrl: "blob:first",
    source: "camera" as const,
    quality: { status: "checking" as const },
  };
  const second = { ...first, objectUrl: "blob:second" };
  assert.equal(replacePendingCapture(first, second, (url) => revoked.push(url)), second);
  assert.equal(replacePendingCapture(second, null, (url) => revoked.push(url)), null);
  assert.deepEqual(revoked, ["blob:first", "blob:second"]);
});
