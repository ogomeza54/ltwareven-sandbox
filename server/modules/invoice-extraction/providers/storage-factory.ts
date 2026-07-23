import { randomUUID } from "node:crypto";
import type { InvoiceConfig } from "../config/invoice-config";
import { FilesystemPrivateStorage } from "./filesystem-private-storage";
import type { PrivateStoragePort } from "./private-storage";
import { ReplitPrivateStorage } from "./replit-private-storage";

export function opaqueInvoiceObjectKey(): string {
  return `invoice-sources/${randomUUID()}/${randomUUID()}`;
}

export function createPrivateStorage(config: InvoiceConfig): PrivateStoragePort {
  if (config.storageBackend === "replit") {
    if (!config.storageBucket) {
      throw new Error("Replit object storage bucket is required");
    }
    return new ReplitPrivateStorage(config.storageBucket);
  }
  if (config.nodeEnvironment === "production") {
    throw new Error("Production invoice storage cannot use local filesystem");
  }
  return new FilesystemPrivateStorage(config.storageRoot);
}
