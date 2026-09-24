import { test, expect } from "@playwright/test";

test("source-first workspace imports without credentials and exports source text", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lähdeaineisto" })).toBeVisible();
  await expect(page.getByLabel("Viesti tai sopimusteksti")).toHaveCount(0);
  await page.getByRole("button", { name: "+ Tuo teksti" }).click();
  await page.getByLabel("Dokumentin nimi").fill("Demo agreement");
  await page.getByLabel("Alkuperäinen teksti").fill("1. Delivery\nThe supplier delivers within 14 days.");
  await page.getByRole("button", { name: "Tuo ja pilko lähteiksi" }).click();
  await expect(page.getByText("Demo agreement", { exact: true })).toBeVisible();
  await page.getByText("Demo agreement", { exact: true }).click();
  await expect(page.locator("blockquote").filter({ hasText: "The supplier delivers" })).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Vie JSON" }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(payload.format).toBe("contract-map");
  expect(payload.sourceDocuments.some((d: { title: string }) => d.title === "Demo agreement")).toBe(true);
});
