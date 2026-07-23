import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeMatchText,
  rankPartCandidates,
  type MatchablePart,
} from "../../modules/invoice-extraction/domain/part-matching";

const parts: MatchablePart[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Freightliner brake pad",
    partNumber: "BP-100",
    category: "Brakes",
    itemType: "inventory",
    aliases: [],
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "Engine oil filter",
    partNumber: "OF-200",
    category: "Filters",
    itemType: "consumable",
    aliases: [
      {
        vendorPartNumberNormalized: "vendor 77",
        descriptionNormalized: "premium oil filter",
      },
    ],
  },
];

test("part matching is normalized, deterministic and explainable", () => {
  assert.equal(normalizeMatchText("  Plaquettes—Freíghtliner "), "plaquettes freightliner");
  const first = rankPartCandidates(
    {
      description: "Brake pad Freightliner",
      vendorPartNumber: "BP 100",
      classification: "inventory",
    },
    parts,
  );
  const second = rankPartCandidates(
    {
      description: "Brake pad Freightliner",
      vendorPartNumber: "BP 100",
      classification: "inventory",
    },
    [...parts].reverse(),
  );
  assert.deepEqual(first, second);
  assert.equal(first[0].part.id, parts[0].id);
  assert.ok(first[0].signals.includes("Exact part reference"));
  assert.ok(first[0].signals.some((signal) => signal.startsWith("Name similarity")));
});

test("confirmed aliases rank without turning weak similarity into a decision", () => {
  const alias = rankPartCandidates(
    {
      description: "unknown",
      vendorPartNumber: "Vendor-77",
      classification: "unknown",
    },
    parts,
  );
  assert.equal(alias[0].part.id, parts[1].id);
  assert.ok(alias[0].signals.includes("Previously confirmed vendor alias"));
  assert.deepEqual(
    rankPartCandidates(
      {
        description: "completely unrelated",
        vendorPartNumber: null,
        classification: "unknown",
      },
      parts,
    ),
    [],
  );
});

test("manual search is tenant-input neutral and returns only the supplied catalog", () => {
  const result = rankPartCandidates(
    {
      description: null,
      vendorPartNumber: null,
      classification: "unknown",
      query: "oil filter",
    },
    parts,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].part.id, parts[1].id);
  assert.ok(result[0].signals.includes("Manual search match"));
});
