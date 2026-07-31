export function requireExactLocalTestDatabase(
  rawUrl: string | undefined,
): string {
  if (!rawUrl) {
    throw new Error("TEST_DATABASE_URL must be set");
  }
  const url = new URL(rawUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Integration tests require local PostgreSQL");
  }
  for (const parameter of ["host", "hostaddr", "service"]) {
    if (url.searchParams.has(parameter)) {
      throw new Error(
        `Integration tests forbid PostgreSQL connection override "${parameter}"`,
      );
    }
  }
  if (url.pathname.slice(1) !== "talavera_invoice_test") {
    throw new Error(
      "Integration tests require the exact database talavera_invoice_test",
    );
  }
  return url.toString();
}
