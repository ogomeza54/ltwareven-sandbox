import type { Readable } from "node:stream";

export interface PrivateStoragePort {
  putFromFile(objectKey: string, filename: string): Promise<void>;
  openStream(objectKey: string): Promise<Readable>;
  delete(objectKey: string): Promise<void>;
  exists(objectKey: string): Promise<boolean>;
}

export class PrivateStorageError extends Error {
  constructor(message = "Private storage operation failed") {
    super(message);
    this.name = "PrivateStorageError";
  }
}
