import assert from "node:assert/strict";
import test from "node:test";
import { createClientUuid } from "../../../client/src/lib/client-uuid";

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("client UUID uses the browser implementation when available", () => {
  const expected = "11111111-1111-4111-8111-111111111111";
  assert.equal(createClientUuid({ randomUUID: () => expected }), expected);
});

test("client UUID uses random bytes when randomUUID is unavailable", () => {
  const generated = createClientUuid({
    getRandomValues: (bytes) => {
      bytes.fill(0);
      return bytes;
    },
  });
  assert.equal(generated, "00000000-0000-4000-8000-000000000000");
});

test("client UUID remains valid without Web Crypto on local mobile HTTP", () => {
  assert.match(createClientUuid({}), uuidV4Pattern);
});
