import {
  createReadStream,
  existsSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { copyFile, mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { Readable } from "node:stream";
import {
  PrivateStorageError,
  type PrivateStoragePort,
} from "./private-storage";

export class FilesystemPrivateStorage implements PrivateStoragePort {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    const publicRoot = resolve(process.cwd(), "uploads");
    const relativeToPublic = relative(publicRoot, this.root);
    if (
      !relativeToPublic ||
      (!relativeToPublic.startsWith("..") && !isAbsolute(relativeToPublic))
    ) {
      throw new Error("Invoice private storage cannot use the public uploads root");
    }
    if (existsSync(this.root)) {
      const canonicalRoot = realpathSync(this.root);
      const canonicalPublic = existsSync(publicRoot)
        ? realpathSync(publicRoot)
        : publicRoot;
      const canonicalRelative = relative(canonicalPublic, canonicalRoot);
      if (
        !canonicalRelative ||
        (!canonicalRelative.startsWith("..") &&
          !isAbsolute(canonicalRelative))
      ) {
        throw new Error(
          "Invoice private storage cannot resolve into the public uploads root",
        );
      }
      if (lstatSync(this.root).isSymbolicLink()) {
        throw new Error("Invoice private storage root cannot be a symbolic link");
      }
    }
  }

  private pathFor(objectKey: string): string {
    if (
      !/^[a-z0-9][a-z0-9/_-]{1,240}$/i.test(objectKey) ||
      isAbsolute(objectKey)
    ) {
      throw new PrivateStorageError("Invalid private object key");
    }
    const target = resolve(this.root, objectKey);
    const rel = relative(this.root, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
      throw new PrivateStorageError("Invalid private object key");
    }
    return target;
  }

  async putFromFile(objectKey: string, filename: string): Promise<void> {
    const target = this.pathFor(objectKey);
    const temporary = `${target}.partial-${process.pid}-${Date.now()}`;
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    try {
      const [canonicalRoot, canonicalParent] = await Promise.all([
        realpath(this.root),
        realpath(dirname(target)),
      ]);
      const parentRelative = relative(canonicalRoot, canonicalParent);
      if (
        parentRelative.startsWith("..") ||
        isAbsolute(parentRelative)
      ) {
        throw new PrivateStorageError("Invalid private storage path");
      }
      await copyFile(filename, temporary);
      const handle = await open(temporary, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new PrivateStorageError(
        error instanceof Error ? error.name : "filesystem error",
      );
    }
  }

  async openStream(objectKey: string): Promise<Readable> {
    const target = this.pathFor(objectKey);
    try {
      await stat(target);
      return createReadStream(target);
    } catch (error) {
      throw new PrivateStorageError(
        error instanceof Error ? error.name : "filesystem error",
      );
    }
  }

  async delete(objectKey: string): Promise<void> {
    await rm(this.pathFor(objectKey), { force: true });
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await stat(this.pathFor(objectKey));
      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return false;
      }
      throw new PrivateStorageError();
    }
  }
}
