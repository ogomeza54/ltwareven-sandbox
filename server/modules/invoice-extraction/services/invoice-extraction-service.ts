import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceExtractionRunDto,
} from "@shared/invoice-extraction/contracts";
import { loadInvoiceConfig, type InvoiceConfig } from "../config/invoice-config";
import { requireInvoiceCapability } from "../domain/policies";
import { createPrivateStorage } from "../providers/storage-factory";
import { OpenAIInvoiceProvider } from "../providers/openai-invoice-provider";
import type {
  InvoiceExtractionProviderPort,
  InvoiceProviderAsset,
  InvoiceProviderResult,
} from "../providers/extraction-provider";
import type { PrivateStoragePort } from "../providers/private-storage";
import { PostgresInvoiceRepository } from "../repositories/invoice-repository";
import {
  PostgresInvoiceExtractionRepository,
  type ClaimedExtractionAttempt,
} from "../repositories/invoice-extraction-repository";

async function readBounded(stream: Readable, maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > maximum) {
      stream.destroy();
      throw new InvoiceDomainError("INVOICE_FILE_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export class InvoiceExtractionService {
  constructor(
    private readonly repository: PostgresInvoiceExtractionRepository,
    private readonly featureRepository: Pick<PostgresInvoiceRepository, "resolveFeatures">,
    private readonly provider: InvoiceExtractionProviderPort,
    private readonly storage: PrivateStoragePort,
    private readonly config: InvoiceConfig,
  ) {}

  async start(
    actor: InvoiceActorContext,
    draftId: string,
    expectedRevision: number,
    requestId?: string,
  ): Promise<InvoiceExtractionRunDto> {
    requireInvoiceCapability(actor, "process_draft");
    const features = await this.featureRepository.resolveFeatures(actor.effectiveCompanyId);
    if (!features.scanExtraction) {
      throw new InvoiceDomainError("INVOICE_FEATURE_DISABLED");
    }
    if (!this.provider.isConfigured()) {
      throw new InvoiceDomainError("INVOICE_PROVIDER_UNAVAILABLE");
    }
    return this.repository.start(actor, draftId, expectedRevision, requestId, this.config);
  }

  async get(
    actor: InvoiceActorContext,
    runId: string,
  ): Promise<InvoiceExtractionRunDto> {
    requireInvoiceCapability(actor, "process_draft");
    const run = await this.repository.get(actor, runId);
    if (!run) throw new InvoiceDomainError("INVOICE_RUN_NOT_FOUND");
    return run;
  }

  async processOne(workerId = `invoice-worker-${randomUUID()}`): Promise<boolean> {
    if (!this.provider.isConfigured()) return false;
    const attempt = await this.repository.claimNext(
      workerId,
      this.config.workerLeaseSeconds,
    );
    if (!attempt) return false;
    try {
      const result = attempt.providerResponseId
        ? await this.provider.retrieve(attempt.providerResponseId)
        : await this.provider.submit({
            assets: await this.loadAssets(attempt),
            model: attempt.model,
            reasoningEffort: this.config.reasoningEffort,
            background: attempt.executionMode === "background",
            storeResponse: attempt.storeResponse,
          });
      await this.persistProviderResult(attempt, result);
    } catch {
      try {
        await this.repository.settleClaim(attempt, {
          status: "failed",
          responseId: attempt.providerResponseId,
          failureCode: "PROVIDER_FAILED",
        });
      } catch {
        // A lost lease is safely reclaimed from PostgreSQL by another worker.
      }
    }
    return true;
  }

  async receiveWebhook(
    rawBody: string,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): Promise<{ accepted: boolean; eventId: string; responseId: string }> {
    let event: { eventId: string; eventType: string; responseId: string };
    try {
      event = await this.provider.unwrapWebhook(rawBody, headers);
    } catch {
      throw new InvoiceDomainError("INVOICE_WEBHOOK_INVALID");
    }
    const accepted = await this.repository.recordWebhook(
      event.eventId,
      event.eventType,
      event.responseId,
    );
    return { accepted, eventId: event.eventId, responseId: event.responseId };
  }

  async reconcileWebhook(
    eventId: string,
    responseId: string,
  ): Promise<void> {
    try {
      const result = await this.provider.retrieve(responseId);
      if (result.status !== "pending") {
        await this.repository.settleByResponse(responseId, result);
      }
      await this.repository.markWebhookProcessed(eventId);
    } catch {
      // PostgreSQL polling remains the durable fallback.
    }
  }

  private async loadAssets(
    attempt: ClaimedExtractionAttempt,
  ): Promise<InvoiceProviderAsset[]> {
    const sources = await this.repository.listSources(
      attempt.companyId,
      attempt.draftId,
    );
    if (sources.length === 0) {
      throw new InvoiceDomainError("INVOICE_SOURCE_REQUIRED");
    }
    const assets: InvoiceProviderAsset[] = [];
    for (const source of sources) {
      assets.push({
        id: source.id,
        mimeType: source.detectedType,
        displayName: source.displayName,
        bytes: await readBounded(
          await this.storage.openStream(source.objectKey),
          this.config.maxFileBytes,
        ),
      });
    }
    return assets;
  }

  private async persistProviderResult(
    attempt: ClaimedExtractionAttempt,
    result: InvoiceProviderResult,
  ): Promise<void> {
    if (result.status === "pending") {
      await this.repository.markSubmitted(
        attempt,
        result.responseId,
        this.config.workerPollSeconds,
      );
      return;
    }
    await this.repository.settleClaim(attempt, result);
  }
}

let singleton: InvoiceExtractionService | undefined;
let wakeWorker: (() => void) | undefined;

export function getInvoiceExtractionService(): InvoiceExtractionService {
  if (!singleton) {
    const config = loadInvoiceConfig();
    singleton = new InvoiceExtractionService(
      new PostgresInvoiceExtractionRepository(),
      new PostgresInvoiceRepository(),
      new OpenAIInvoiceProvider(config.openaiApiKey, config.openaiWebhookSecret),
      createPrivateStorage(config),
      config,
    );
  }
  return singleton;
}

export function startInvoiceExtractionWorker(): () => void {
  const config = loadInvoiceConfig();
  const service = getInvoiceExtractionService();
  let active = false;
  const tick = async () => {
    if (active) return;
    active = true;
    try {
      while (await service.processOne()) {
        // Drain immediately available work; submitted jobs are scheduled in PostgreSQL.
      }
    } finally {
      active = false;
    }
  };
  const timer = setInterval(() => void tick(), config.workerPollSeconds * 1000);
  timer.unref();
  const wake = () => void tick();
  wakeWorker = wake;
  wake();
  return () => {
    clearInterval(timer);
    if (wakeWorker === wake) wakeWorker = undefined;
  };
}

export function wakeInvoiceExtractionWorker(): void {
  wakeWorker?.();
}
