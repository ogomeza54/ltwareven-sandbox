import type { PDFDocumentProxy } from "pdfjs-dist";

export const MAX_CAPTURE_ANALYSIS_PIXELS = 1_000_000;
export const MAX_CAPTURE_SIDE_PIXELS = 20_000;

export type CaptureQualityWarningCode =
  | "low-resolution"
  | "dark"
  | "low-contrast"
  | "blurred"
  | "landscape-orientation";

export interface CaptureQualityWarning {
  code: CaptureQualityWarningCode;
  message: string;
  action: string;
  page?: number;
}

export interface PdfPageQualityResult {
  page: number;
  width: number;
  height: number;
  warnings: CaptureQualityWarning[];
}

export type CaptureQualityResult =
  | {
      status: "available";
      width: number;
      height: number;
      warnings: CaptureQualityWarning[];
      pages?: PdfPageQualityResult[];
    }
  | {
      status: "unavailable";
      reason: string;
    };

export interface PendingInvoiceCapture {
  file: File;
  objectUrl: string;
  source: "camera" | "file";
  quality: CaptureQualityResult | { status: "checking" };
}

const warningText: Record<
  CaptureQualityWarningCode,
  Omit<CaptureQualityWarning, "code">
> = {
  "low-resolution": {
    message: "This image may be too small for reliable reading.",
    action: "Move closer and retake the photo at the highest available resolution.",
  },
  dark: {
    message: "This image appears too dark.",
    action: "Add even lighting and avoid casting a shadow over the invoice.",
  },
  "low-contrast": {
    message: "The text and background have low contrast.",
    action: "Use brighter, even lighting and place the invoice on a contrasting surface.",
  },
  blurred: {
    message: "This image may be blurred.",
    action: "Hold the phone steady, tap to focus, and retake the photo.",
  },
  "landscape-orientation": {
    message: "The invoice may be sideways.",
    action: "Check that the document is upright before continuing.",
  },
};

function warning(code: CaptureQualityWarningCode): CaptureQualityWarning {
  return { code, ...warningText[code] };
}

export function readRasterDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && length >= 7) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

export function analyzeCapturePixels(
  rgba: Uint8ClampedArray,
  sampledWidth: number,
  sampledHeight: number,
  originalWidth = sampledWidth,
  originalHeight = sampledHeight,
): CaptureQualityResult {
  const pixelCount = sampledWidth * sampledHeight;
  if (
    sampledWidth < 1 ||
    sampledHeight < 1 ||
    pixelCount > MAX_CAPTURE_ANALYSIS_PIXELS ||
    rgba.length !== pixelCount * 4
  ) {
    return {
      status: "unavailable",
      reason: "Local quality checking could not read this document.",
    };
  }

  const luminance = new Float32Array(pixelCount);
  let sum = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const value =
      rgba[offset] * 0.2126 +
      rgba[offset + 1] * 0.7152 +
      rgba[offset + 2] * 0.0722;
    luminance[index] = value;
    sum += value;
  }
  const mean = sum / pixelCount;
  let squaredDifference = 0;
  for (let index = 0; index < luminance.length; index += 1) {
    squaredDifference += (luminance[index] - mean) ** 2;
  }
  const contrast = Math.sqrt(squaredDifference / pixelCount);

  let laplacianSquared = 0;
  let laplacianCount = 0;
  for (let y = 1; y < sampledHeight - 1; y += 1) {
    for (let x = 1; x < sampledWidth - 1; x += 1) {
      const index = y * sampledWidth + x;
      const laplacian =
        luminance[index - sampledWidth] +
        luminance[index + sampledWidth] +
        luminance[index - 1] +
        luminance[index + 1] -
        luminance[index] * 4;
      laplacianSquared += laplacian * laplacian;
      laplacianCount += 1;
    }
  }
  const sharpness = laplacianCount ? laplacianSquared / laplacianCount : 0;
  const warnings: CaptureQualityWarning[] = [];
  if (Math.min(originalWidth, originalHeight) < 900) {
    warnings.push(warning("low-resolution"));
  }
  if (mean < 55) warnings.push(warning("dark"));
  if (contrast < 18) warnings.push(warning("low-contrast"));
  if (sharpness < 60 && contrast >= 18) warnings.push(warning("blurred"));
  if (originalWidth > originalHeight * 1.45) {
    warnings.push(warning("landscape-orientation"));
  }
  return {
    status: "available",
    width: originalWidth,
    height: originalHeight,
    warnings,
  };
}

async function analyzePdfFile(file: File): Promise<CaptureQualityResult> {
  if (typeof document === "undefined") {
    return {
      status: "unavailable",
      reason: "This browser cannot check PDF page quality locally. You can still upload the original.",
    };
  }

  let pdf: PDFDocumentProxy | null = null;
  try {
    const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    GlobalWorkerOptions.workerSrc = workerModule.default;
    const loadingTask = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useWorkerFetch: false,
      stopAtErrors: true,
    });
    pdf = await loadingTask.promise;
    if (pdf.numPages > 10) {
      return {
        status: "unavailable",
        reason: "This PDF has more than 10 pages. Select a document with no more than 10 pages.",
      };
    }

    const pages: PdfPageQualityResult[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const inspectionViewport = page.getViewport({ scale: 2 });
        if (
          !Number.isFinite(inspectionViewport.width) ||
          !Number.isFinite(inspectionViewport.height) ||
          inspectionViewport.width < 1 ||
          inspectionViewport.height < 1 ||
          inspectionViewport.width > MAX_CAPTURE_SIDE_PIXELS ||
          inspectionViewport.height > MAX_CAPTURE_SIDE_PIXELS
        ) {
          throw new Error("Unsafe PDF page dimensions");
        }
        const scale = Math.min(
          1,
          Math.sqrt(
            MAX_CAPTURE_ANALYSIS_PIXELS /
              (inspectionViewport.width * inspectionViewport.height),
          ),
        );
        const viewport = page.getViewport({ scale: 2 * scale });
        const width = Math.max(1, Math.floor(viewport.width));
        const height = Math.max(1, Math.floor(viewport.height));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: true,
        });
        if (!context) throw new Error("Canvas unavailable");
        await page.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;
        const pixels = context.getImageData(0, 0, width, height);
        const result = analyzeCapturePixels(
          pixels.data,
          width,
          height,
          Math.floor(inspectionViewport.width),
          Math.floor(inspectionViewport.height),
        );
        if (result.status !== "available") {
          throw new Error("Page quality unavailable");
        }
        pages.push({
          page: pageNumber,
          width: result.width,
          height: result.height,
          warnings: result.warnings.map((item) => ({
            ...item,
            page: pageNumber,
          })),
        });
      } finally {
        page.cleanup();
      }
    }

    const firstPage = pages[0];
    if (!firstPage) throw new Error("PDF has no pages");
    return {
      status: "available",
      width: firstPage.width,
      height: firstPage.height,
      warnings: pages.flatMap((page) => page.warnings),
      pages,
    };
  } catch {
    return {
      status: "unavailable",
      reason:
        "PDF quality checks could not be completed locally. Review every rendered page before upload.",
    };
  } finally {
    await pdf?.destroy();
  }
}

export async function analyzeInvoiceFile(
  file: File,
): Promise<CaptureQualityResult> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return analyzePdfFile(file);
  }
  if (/hei[cf]$/i.test(file.name)) {
    return {
      status: "unavailable",
      reason:
        "A local preview is not available for this format. Review the filename and document before upload.",
    };
  }
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return {
      status: "unavailable",
      reason:
        "This browser cannot check image quality locally. You can still upload the original.",
    };
  }
  let bitmap: ImageBitmap | null = null;
  try {
    const header = new Uint8Array(
      await file.slice(0, Math.min(file.size, 524_288)).arrayBuffer(),
    );
    const dimensions = readRasterDimensions(header);
    if (!dimensions?.width || !dimensions.height) {
      throw new Error("Unsupported preview dimensions");
    }
    if (
      dimensions.width > MAX_CAPTURE_SIDE_PIXELS ||
      dimensions.height > MAX_CAPTURE_SIDE_PIXELS ||
      dimensions.width * dimensions.height > 40_000_000
    ) {
      return {
        status: "unavailable",
        reason:
          "This image is too large for a safe local quality check. The server will validate the original.",
      };
    }
    const scale = Math.min(
      1,
      Math.sqrt(
        MAX_CAPTURE_ANALYSIS_PIXELS /
          (dimensions.width * dimensions.height),
      ),
    );
    const width = Math.max(1, Math.floor(dimensions.width * scale));
    const height = Math.max(1, Math.floor(dimensions.height * scale));
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    return analyzeCapturePixels(
      pixels.data,
      width,
      height,
      dimensions.width,
      dimensions.height,
    );
  } catch {
    return {
      status: "unavailable",
      reason:
        "This document could not be previewed or checked locally. The server will still validate the original.",
    };
  } finally {
    bitmap?.close();
  }
}

export function replacePendingCapture(
  current: PendingInvoiceCapture | null,
  next: PendingInvoiceCapture | null,
  revoke: (url: string) => void = URL.revokeObjectURL,
): PendingInvoiceCapture | null {
  if (current && current.objectUrl !== next?.objectUrl) {
    revoke(current.objectUrl);
  }
  return next;
}
