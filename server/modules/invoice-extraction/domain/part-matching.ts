import type { InvoicePartCandidate } from "@shared/invoice-extraction/contracts";

export interface MatchablePart {
  id: string;
  name: string;
  partNumber: string;
  category: string | null;
  itemType: "inventory" | "consumable";
  aliases: Array<{
    vendorPartNumberNormalized: string | null;
    descriptionNormalized: string | null;
  }>;
}

export function normalizeMatchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactReference(value: string | null | undefined): string {
  return normalizeMatchText(value).replace(/\s/g, "");
}

function editSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function canonicalName(value: string): string {
  return normalizeMatchText(value)
    .split(" ")
    .map((token) => (token === "kit" ? "kt" : token))
    .join(" ");
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(canonicalName(left).split(" ").filter(Boolean));
  const rightTokens = new Set(canonicalName(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

export function rankPartCandidates(
  input: {
    description: string | null;
    vendorPartNumber: string | null;
    classification: "inventory" | "consumable" | "service" | "direct_expense" | "adjustment" | "unknown";
    query?: string | null;
  },
  parts: readonly MatchablePart[],
  limit = 8,
): InvoicePartCandidate[] {
  const reference = compactReference(input.vendorPartNumber);
  const searchText = normalizeMatchText(input.query || input.description);
  return parts
    .map((part) => {
      const signals: string[] = [];
      let score = 0;
      const partReference = compactReference(part.partNumber);
      if (reference && reference === partReference) {
        score += 70;
        signals.push("Exact part reference");
      } else if (reference.length >= 8 && partReference.length >= 8) {
        const similarity = editSimilarity(reference, partReference);
        if (similarity >= 0.72) {
          score += Math.round(similarity * 45);
          signals.push(`Similar part reference ${Math.round(similarity * 100)}%`);
        }
      }
      const aliasReference = part.aliases.some(
        (alias) =>
          reference &&
          reference === compactReference(alias.vendorPartNumberNormalized),
      );
      if (aliasReference) {
        score = Math.max(score, 65);
        signals.push("Previously confirmed vendor alias");
      }
      const similarities = [
        tokenSimilarity(searchText, part.name),
        ...part.aliases.map((alias) =>
          tokenSimilarity(searchText, alias.descriptionNormalized ?? ""),
        ),
      ];
      const similarity = Math.max(...similarities);
      if (similarity > 0) {
        score += Math.round(similarity * 25);
        signals.push(`Name similarity ${Math.round(similarity * 100)}%`);
      }
      if (
        input.classification !== "unknown" &&
        input.classification === part.itemType
      ) {
        score += 5;
        signals.push("Same item type");
      }
      const query = normalizeMatchText(input.query);
      if (
        query &&
        (normalizeMatchText(part.name).includes(query) ||
          compactReference(part.partNumber).includes(query.replace(/\s/g, "")))
      ) {
        score += 20;
        signals.push("Manual search match");
      }
      return {
        part: {
          id: part.id,
          name: part.name,
          partNumber: part.partNumber,
          category: part.category,
          itemType: part.itemType,
        },
        score: Math.min(100, score),
        signals,
      };
    })
    .filter((candidate) => candidate.score >= (input.query ? 20 : 15))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.part.partNumber.localeCompare(right.part.partNumber) ||
        left.part.id.localeCompare(right.part.id),
    )
    .slice(0, limit);
}
