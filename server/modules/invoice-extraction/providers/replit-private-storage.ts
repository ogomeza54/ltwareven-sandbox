import { Client } from "@replit/object-storage";
import type { Readable } from "node:stream";
import {
  PrivateStorageError,
  type PrivateStoragePort,
} from "./private-storage";

export class ReplitPrivateStorage implements PrivateStoragePort {
  private readonly client: Client;

  constructor(bucketId: string, client?: Client) {
    if (!bucketId) throw new Error("Replit object storage bucket is required");
    this.client = client ?? new Client({ bucketId });
  }

  async putFromFile(objectKey: string, filename: string): Promise<void> {
    const result = await this.client.uploadFromFilename(objectKey, filename, {
      compress: false,
    });
    if (!result.ok) throw new PrivateStorageError();
  }

  async openStream(objectKey: string): Promise<Readable> {
    const exists = await this.client.exists(objectKey);
    if (!exists.ok || !exists.value) throw new PrivateStorageError();
    return this.client.downloadAsStream(objectKey, { decompress: false });
  }

  async delete(objectKey: string): Promise<void> {
    const result = await this.client.delete(objectKey, {
      ignoreNotFound: true,
    });
    if (!result.ok) throw new PrivateStorageError();
  }

  async exists(objectKey: string): Promise<boolean> {
    const result = await this.client.exists(objectKey);
    if (!result.ok) throw new PrivateStorageError();
    return result.value;
  }
}
