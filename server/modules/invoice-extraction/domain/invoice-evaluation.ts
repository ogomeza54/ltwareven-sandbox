import {
  invoiceEvaluationMetricsSchema,
  type InvoiceEvaluationDocument,
  type InvoiceEvaluationMetrics,
} from "@shared/invoice-extraction/contracts";

const headerFields = [
  "vendorName",
  "invoiceNumber",
  "invoiceDate",
  "currency",
  "subtotal",
  "tax",
  "freight",
  "total",
] as const;
const criticalFields = ["vendorName", "invoiceNumber", "total"] as const;

function normalized(value: string | null): string {
  return (value ?? "").normalize("NFKC").trim().toLowerCase();
}

function lineSignature(line: InvoiceEvaluationDocument["lines"][number]): string {
  return JSON.stringify([
    normalized(line.description),
    normalized(line.vendorPartNumber),
    normalized(line.quantity),
    normalized(line.unitCost),
  ]);
}

export function scoreInvoiceEvaluation(
  examples: readonly {
    fixtureKey: string;
    expected: InvoiceEvaluationDocument;
    prediction: InvoiceEvaluationDocument;
  }[],
): InvoiceEvaluationMetrics {
  let correctFields = 0;
  let totalFields = 0;
  let exactLines = 0;
  let expectedLines = 0;
  let predictedLines = 0;
  let exactDocuments = 0;
  let correctSuppliers = 0;
  const criticalRegressions: InvoiceEvaluationMetrics["criticalRegressions"] = [];

  for (const example of examples) {
    let documentExact = true;
    for (const field of headerFields) {
      totalFields += 1;
      if (
        normalized(example.expected.header[field]) ===
        normalized(example.prediction.header[field])
      ) {
        correctFields += 1;
      } else {
        documentExact = false;
        const criticalField = criticalFields.find((value) => value === field);
        if (criticalField) {
          criticalRegressions.push({
            fixtureKey: example.fixtureKey,
            field: criticalField,
          });
        }
      }
    }
    if (
      normalized(example.expected.header.vendorName) ===
      normalized(example.prediction.header.vendorName)
    ) {
      correctSuppliers += 1;
    }
    const expectedCounts = new Map<string, number>();
    for (const line of example.expected.lines) {
      const signature = lineSignature(line);
      expectedCounts.set(signature, (expectedCounts.get(signature) ?? 0) + 1);
    }
    let matchedThisDocument = 0;
    for (const line of example.prediction.lines) {
      const signature = lineSignature(line);
      const remaining = expectedCounts.get(signature) ?? 0;
      if (remaining > 0) {
        exactLines += 1;
        matchedThisDocument += 1;
        expectedCounts.set(signature, remaining - 1);
      }
    }
    expectedLines += example.expected.lines.length;
    predictedLines += example.prediction.lines.length;
    if (
      matchedThisDocument !== example.expected.lines.length ||
      example.prediction.lines.length !== example.expected.lines.length
    ) {
      documentExact = false;
    }
    if (documentExact) exactDocuments += 1;
  }

  return invoiceEvaluationMetricsSchema.parse({
    examples: examples.length,
    headerFields: {
      correct: correctFields,
      total: totalFields,
      accuracy: correctFields / totalFields,
    },
    lines: {
      exact: exactLines,
      expected: expectedLines,
      predicted: predictedLines,
      precision: predictedLines === 0 ? null : exactLines / predictedLines,
      recall: expectedLines === 0 ? null : exactLines / expectedLines,
    },
    documentsExact: {
      correct: exactDocuments,
      total: examples.length,
      rate: exactDocuments / examples.length,
    },
    suppliers: {
      correct: correctSuppliers,
      total: examples.length,
      accuracy: correctSuppliers / examples.length,
    },
    criticalRegressions,
    // Pilot thresholds are intentionally not invented before an authorized baseline.
    insufficientForThreshold: true,
  });
}
