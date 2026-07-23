import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FilesystemPrivateStorage } from "../../modules/invoice-extraction/providers/filesystem-private-storage";

test("filesystem private storage satisfies put/read/exists/delete contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "invoice-storage-test-"));
  const source = join(root, "source");
  const storage = new FilesystemPrivateStorage(join(root, "private"));
  try {
    await writeFile(source, "private invoice bytes");
    assert.equal(await storage.exists("invoice-sources/a/b"), false);
    await storage.putFromFile("invoice-sources/a/b", source);
    assert.equal(await storage.exists("invoice-sources/a/b"), true);
    const stream = await storage.openStream("invoice-sources/a/b");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString(), "private invoice bytes");
    await storage.delete("invoice-sources/a/b");
    await storage.delete("invoice-sources/a/b");
    assert.equal(await storage.exists("invoice-sources/a/b"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem private storage rejects traversal and public uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "invoice-storage-test-"));
  try {
    const storage = new FilesystemPrivateStorage(join(root, "private"));
    await assert.rejects(() => storage.exists("../escape"));
    await assert.rejects(() => storage.exists("/absolute"));
    assert.throws(
      () =>
        new FilesystemPrivateStorage(
          join(process.cwd(), "uploads", "invoice-private"),
        ),
      /public uploads/,
    );
    const alias = join(root, "private-alias");
    await symlink(join(process.cwd(), "uploads"), alias);
    assert.throws(
      () => new FilesystemPrivateStorage(alias),
      /public uploads|symbolic link/,
    );
    await assert.rejects(() => readFile(join(root, "escape")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
