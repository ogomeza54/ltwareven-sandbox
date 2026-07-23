import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceEvaluationDocument,
} from "@shared/invoice-extraction/contracts";
import { canonicalPayloadHash } from "../domain/confirmation-intent";
import { scoreInvoiceEvaluation } from "../domain/invoice-evaluation";
import { requireInvoiceCapability } from "../domain/policies";
import { PostgresInvoiceEvaluationRepository } from "../repositories/invoice-evaluation-repository";

export class InvoiceEvaluationService {
  constructor(
    private readonly repository = new PostgresInvoiceEvaluationRepository(),
  ) {}

  registerEngine(
    actor: InvoiceActorContext,
    input: Parameters<PostgresInvoiceEvaluationRepository["registerEngine"]>[1],
  ) {
    requireInvoiceCapability(actor, "engine_activation");
    return this.repository.registerEngine(actor, input);
  }

  createSet(
    actor: InvoiceActorContext,
    input: {
      name: string;
      version: number;
      source: "synthetic" | "authorized_feedback";
      consentRecorded: boolean;
      examples: readonly {
        fixtureKey: string;
        split: "tuning" | "test";
        expected: InvoiceEvaluationDocument;
        inputMetadata: { pageCount: number; synthetic: boolean };
      }[];
    },
  ) {
    requireInvoiceCapability(actor, "engine_activation");
    if (new Set(input.examples.map((item) => item.fixtureKey)).size !== input.examples.length) {
      throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
    }
    return this.repository.createSet(actor, {
      ...input,
      snapshotHash: canonicalPayloadHash(input.examples),
    });
  }

  async run(
    actor: InvoiceActorContext,
    input: {
      setId: string;
      engineVersion: string;
      predictions: readonly {
        fixtureKey: string;
        prediction: InvoiceEvaluationDocument;
      }[];
    },
  ) {
    requireInvoiceCapability(actor, "engine_activation");
    const examples = await this.repository.examples(actor, input.setId);
    if (
      examples.length === 0 ||
      examples.length !== input.predictions.length ||
      new Set(input.predictions.map((item) => item.fixtureKey)).size !==
        input.predictions.length
    ) {
      throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
    }
    const predictions = new Map(
      input.predictions.map((item) => [item.fixtureKey, item.prediction]),
    );
    const scored = examples.map((example) => {
      const prediction = predictions.get(example.fixtureKey);
      if (!prediction) throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
      return { ...example, prediction };
    });
    const metrics = scoreInvoiceEvaluation(scored);
    return this.repository.saveRun(actor, {
      setId: input.setId,
      engineVersion: input.engineVersion,
      configHash: canonicalPayloadHash({ engineVersion: input.engineVersion }),
      predictionsHash: canonicalPayloadHash(input.predictions),
      metrics,
    });
  }

  comparisons(actor: InvoiceActorContext, setId: string) {
    requireInvoiceCapability(actor, "quality_read");
    return this.repository.comparisons(actor, setId);
  }

  activate(
    actor: InvoiceActorContext,
    input: {
      engineVersion: string;
      evaluationRunId: string;
      expectedRevision: number;
      reason: string;
    },
    requestId?: string,
  ) {
    requireInvoiceCapability(actor, "engine_activation");
    return this.repository.activate(actor, { ...input, requestId });
  }
}
