import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export class InvoiceNumericError extends Error {
  constructor(public readonly field: string) {
    super(`Invalid invoice numeric value for ${field}`);
    this.name = "InvoiceNumericError";
  }
}

function parseDecimal(
  value: string,
  field: string,
  maxScale: number,
  maxIntegerDigits = 14,
  allowNegative = false,
): Decimal {
  const pattern = allowNegative
    ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
    : /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new InvoiceNumericError(field);
  }
  const [integer, fraction = ""] = value.replace(/^-/, "").split(".");
  if (integer.length > maxIntegerDigits || fraction.length > maxScale) {
    throw new InvoiceNumericError(field);
  }
  return new Decimal(value);
}

export function centsToDecimal(cents: Decimal): string {
  return cents.div(100).toFixed(2);
}

export function normalizeQuantity(value: string, field = "quantity"): string {
  const decimal = parseDecimal(value, field, 6, 14, true);
  if (decimal.isZero()) throw new InvoiceNumericError(field);
  return value;
}

export function normalizeUnitCost(value: string, field = "unitCost"): string {
  parseDecimal(value, field, 4);
  return value;
}

export function deriveUnitCostFromLineTotal(
  quantity: string,
  lineTotal: string,
  field = "line",
): string {
  const parsedQuantity = parseDecimal(
    quantity,
    `${field}.quantity`,
    6,
    14,
    true,
  );
  if (parsedQuantity.isZero()) {
    throw new InvoiceNumericError(`${field}.quantity`);
  }
  const parsedLineTotal = parseDecimal(
    lineTotal,
    `${field}.lineTotal`,
    2,
    14,
    true,
  );
  const derived = parsedLineTotal.div(parsedQuantity);
  if (derived.isNegative()) {
    throw new InvoiceNumericError(`${field}.lineTotal`);
  }
  return derived.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed();
}

export function moneyToCents(value: string, field: string): Decimal {
  return parseDecimal(value, field, 2)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export function lineExtensionCents(
  quantity: string,
  unitCost: string,
  field = "line",
): Decimal {
  const signedLeft = parseDecimal(quantity, `${field}.quantity`, 6, 14, true);
  if (signedLeft.isZero()) {
    throw new InvoiceNumericError(`${field}.quantity`);
  }
  const right = parseDecimal(unitCost, `${field}.unitCost`, 4);
  return signedLeft
    .mul(right)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export interface InvoiceMoneyLine {
  quantity: string | null;
  unitCost: string | null;
}

export interface InvoiceReconciliation {
  complete: boolean;
  calculatedSubtotal: string | null;
  calculatedTax: string | null;
  calculatedFreight: string | null;
  calculatedTotal: string | null;
  observedSubtotal: string | null;
  observedTax: string | null;
  observedFreight: string | null;
  observedTotal: string | null;
  difference: string | null;
  withinTolerance: boolean;
  lineTotals: Array<string | null>;
}

export function reconcileInvoiceMoney(input: {
  lines: readonly InvoiceMoneyLine[];
  observedSubtotal: string | null;
  observedTax: string | null;
  observedFreight: string | null;
  observedTotal: string | null;
  toleranceCents: number;
}): InvoiceReconciliation {
  const lineTotals: Array<string | null> = [];
  let subtotal = new Decimal(0);
  let complete = input.lines.length > 0;
  input.lines.forEach((line, index) => {
    if (line.quantity === null || line.unitCost === null) {
      lineTotals.push(null);
      complete = false;
      return;
    }
    const value = lineExtensionCents(line.quantity, line.unitCost, `lines.${index}`);
    subtotal = subtotal.add(value);
    lineTotals.push(centsToDecimal(value));
  });
  const tax =
    input.observedTax === null
      ? new Decimal(0)
      : moneyToCents(input.observedTax, "tax");
  const freight =
    input.observedFreight === null
      ? new Decimal(0)
      : moneyToCents(input.observedFreight, "freight");
  const observedTotal =
    input.observedTotal === null
      ? null
      : moneyToCents(input.observedTotal, "total");
  const total = subtotal.add(tax).add(freight);
  const difference =
    observedTotal === null ? null : total.sub(observedTotal);
  if (observedTotal === null) complete = false;
  return {
    complete,
    calculatedSubtotal: complete ? centsToDecimal(subtotal) : null,
    calculatedTax: complete ? centsToDecimal(tax) : null,
    calculatedFreight: complete ? centsToDecimal(freight) : null,
    calculatedTotal: complete ? centsToDecimal(total) : null,
    observedSubtotal: input.observedSubtotal,
    observedTax: input.observedTax,
    observedFreight: input.observedFreight,
    observedTotal: input.observedTotal,
    difference:
      difference === null ? null : centsToDecimal(difference.abs()),
    withinTolerance:
      complete &&
      difference !== null &&
      difference.abs().lte(input.toleranceCents),
    lineTotals,
  };
}
