interface BrowserCryptoLike {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

function browserCrypto(): BrowserCryptoLike | undefined {
  if (typeof globalThis.crypto === "undefined") return undefined;
  return {
    randomUUID:
      typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID.bind(globalThis.crypto)
        : undefined,
    getRandomValues:
      typeof globalThis.crypto.getRandomValues === "function"
        ? (array) => globalThis.crypto.getRandomValues(array)
        : undefined,
  };
}

/**
 * Generates an RFC 4122 version 4 identifier in browsers where
 * crypto.randomUUID is unavailable, including Safari over local HTTP.
 * This value is used for request idempotency, not as an authentication token.
 */
export function createClientUuid(
  cryptoApi: BrowserCryptoLike | undefined = browserCrypto(),
): string {
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    const timestamp = Date.now();
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256) ^
        ((timestamp >>> ((index % 6) * 8)) & 0xff);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
