import { test, expect, type APIRequestContext } from "@playwright/test";
import type { Workspace } from "../../shared/model";
import { WorkspaceStore } from "../../server/store";

async function state(request: APIRequestContext): Promise<Workspace> {
  return (await request.get("/api/state")).json();
}

async function resetDocument(request: APIRequestContext) {
  const current = await state(request);
  const fresh = await new WorkspaceStore().saveDocument();
  const response = await request.post(`/api/document/open?expectedRevision=${current.model.revision}`, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "x-document-name": encodeURIComponent("sopimus.docx"),
    },
    data: fresh.buffer,
  });
  expect(response.ok()).toBeTruthy();
}

test.beforeEach(async ({ request }) => resetDocument(request));

test("browser uses document open and save without JSON transfer controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Avaa dokumentti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tallenna dokumentti" })).toBeVisible();
  await expect(page.getByText(/Tuo JSON|Vie JSON/)).toHaveCount(0);
  await expect(page.locator(".workspace-status")).toContainText("sopimus.docx");
});

test("a diagram can be saved in DOCX and reopened from the same file", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tutustu esimerkillä" }).click();
  await expect(page.locator(".contract-node")).toHaveCount(6);
  await expect(page.locator(".workspace-status")).toContainText("tallentamattomia muutoksia");

  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tallenna dokumentti" }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const docx = Buffer.concat(chunks);
  expect(docx.subarray(0, 2).toString()).toBe("PK");
  await expect(page.locator(".workspace-status")).toContainText("tallennettu");

  await resetDocument(request);
  await expect(page.locator(".contract-node")).toHaveCount(0);
  await page.getByLabel("Avaa Word-dokumentti").setInputFiles({
    name: "sopimuskartta.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx,
  });
  await expect(page.locator(".contract-node")).toHaveCount(6);
  await expect(page.locator(".workspace-status")).toContainText("sopimuskartta.docx");
});

test("invalid DOCX leaves the current diagram intact", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tutustu esimerkillä" }).click();
  await expect(page.locator(".contract-node")).toHaveCount(6);
  await page.getByLabel("Avaa Word-dokumentti").setInputFiles({
    name: "broken.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("not a zip"),
  });
  await expect(page.getByRole("alert")).toContainText("kelvollinen DOCX");
  await expect(page.locator(".contract-node")).toHaveCount(6);
});

test("stale inspector edits cannot overwrite an external correction", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tutustu esimerkillä" }).click();
  await page.locator('.react-flow__node[data-id="N1"]').click();
  await page.getByRole("button", { name: "Muokkaa vaihetta" }).click();
  await page.getByLabel("Otsikko", { exact: true }).fill("Oma keskeneräinen nimi");
  const current = await state(request);
  await request.post("/api/changes", {
    data: {
      expectedRevision: current.model.revision,
      summary: "Ulkoinen korjaus",
      operations: [{ type: "update_node", id: "N1", changes: { title: "Ulkoinen nimi" } }],
    },
  });
  await expect(page.getByText("Rakenne muuttui muokkauksen aikana.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Otsikko", { exact: true })).toHaveValue("Oma keskeneräinen nimi");
  await expect(page.getByRole("button", { name: "Tallenna vaihe" })).toBeDisabled();
});
