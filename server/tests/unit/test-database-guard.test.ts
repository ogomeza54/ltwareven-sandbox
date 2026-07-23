import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { requireExactLocalTestDatabase } from "../../../scripts/test-database-guard";

describe("requireExactLocalTestDatabase", () => {
  test("accepts only the exact local disposable database", () => {
    assert.equal(
      new URL(
        requireExactLocalTestDatabase(
          "postgresql://talavera:talavera@localhost:5432/talavera_invoice_test",
        ),
      ).pathname,
      "/talavera_invoice_test",
    );
  });

  test("rejects remote hosts, other databases and host overrides", () => {
    for (const url of [
      "postgresql://user:pass@example.com:5432/talavera_invoice_test",
      "postgresql://talavera:talavera@localhost:5432/talavera",
      "postgresql://talavera:talavera@localhost:5432/talavera_invoice_test?host=example.com",
      "postgresql://talavera:talavera@localhost:5432/talavera_invoice_test?hostaddr=203.0.113.1",
      "postgresql://talavera:talavera@localhost:5432/talavera_invoice_test?service=remote",
    ]) {
      assert.throws(() => requireExactLocalTestDatabase(url));
    }
  });
});
