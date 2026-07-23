import { expect, test } from "@playwright/test";

test("authorized quality dashboard exposes denominators, low-sample context and filters", async ({
  page,
}) => {
  const requests: URL[] = [];
  await page.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === "/api/auth/user") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "admin-1",
          email: "admin@example.test",
          role: "admin",
          companyId: "company-1",
          ownCompanyId: "company-1",
          activeCompanyName: "Luis's Repair Shop",
          authSource: "local",
          mustChangePassword: false,
        }),
      });
    }
    if (requestUrl.pathname === "/api/notifications") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lowStock: [],
          pendingCountReviews: [],
          pendingRepairOrders: [],
        }),
      });
    }
    if (requestUrl.pathname === "/api/invoice-quality") {
      requests.push(requestUrl);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          window: { from: null, to: null },
          totals: {
            documents: 5,
            runs: 5,
            failedRuns: 1,
            feedbackEvents: 18,
            reviewedEvents: 12,
            correctedEvents: 3,
            acceptedEvents: 9,
            correctionRate: 0.25,
            acceptanceRate: 0.75,
            averageReviewSeconds: 90,
            lowSample: true,
            sampleFloor: 20,
          },
          byDecision: [
            { key: "accepted", count: 9, denominator: 12, rate: 0.75 },
            { key: "corrected", count: 3, denominator: 12, rate: 0.25 },
          ],
          bySubject: [
            { key: "header", count: 12, denominator: 12, rate: 1 },
          ],
          engines: [
            {
              engineVersion: "invoice-v1",
              runs: 5,
              failedRuns: 1,
              retryAttempts: 1,
              pages: 7,
              reviewedEvents: 12,
              correctedEvents: 3,
              correctionRate: 0.25,
            },
          ],
          cases: [
            {
              draftId: "00000000-0000-4000-8000-000000000001",
              status: "confirmed",
              supplier: "Synthetic Vendor",
              engineVersion: "invoice-v1",
              feedbackEvents: 4,
              correctedEvents: 1,
              reviewSeconds: 90,
              updatedAt: "2026-07-23T12:00:00.000Z",
            },
          ],
        }),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.goto("/invoice-quality");
  await expect(page.getByRole("heading", { name: "Invoice AI Quality" })).toBeVisible();
  await expect(page.getByText("3 / 12 reviewed")).toBeVisible();
  await expect(page.getByText(/Low sample: 12 reviewed observations/)).toBeVisible();
  await expect(page.getByText("Synthetic Vendor")).toBeVisible();
  await page.getByLabel("Supplier filter").fill("Synthetic");
  await expect.poll(() =>
    requests.some((url) => url.searchParams.get("supplier") === "Synthetic"),
  ).toBe(true);
});
