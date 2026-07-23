import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReplitPrivateStorage } from "../../modules/invoice-extraction/providers/replit-private-storage";

async function main(): Promise<void> {
  if (process.env.INVOICE_APP_STORAGE_SMOKE_APPROVED !== "true") {
    throw new Error(
      "Set INVOICE_APP_STORAGE_SMOKE_APPROVED=true only for an authorized non-production bucket.",
    );
  }
  const bucket = process.env.REPLIT_OBJECT_STORAGE_BUCKET;
  if (!bucket) throw new Error("REPLIT_OBJECT_STORAGE_BUCKET is required");

  const root = await mkdtemp(join(tmpdir(), "invoice-app-storage-smoke-"));
  const filename = join(root, "synthetic.txt");
  const objectKey = `invoice-source-contract/${randomUUID()}/${randomUUID()}`;
  const storage = new ReplitPrivateStorage(bucket);
  try {
    await writeFile(filename, "synthetic invoice storage contract");
    assert.equal(await storage.exists(objectKey), false);
    await storage.putFromFile(objectKey, filename);
    assert.equal(await storage.exists(objectKey), true);
    const stream = await storage.openStream(objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    assert.equal(
      Buffer.concat(chunks).toString(),
      "synthetic invoice storage contract",
    );
    await storage.delete(objectKey);
    assert.equal(await storage.exists(objectKey), false);
  } finally {
    await storage.delete(objectKey).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}

void main();
