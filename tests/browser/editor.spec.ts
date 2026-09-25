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
      "x-document-name": encodeURIComponent("semantic-logic-map.docx"),
    },
    data: fresh.buffer,
  });
  expect(response.ok()).toBeTruthy();
}

test.beforeEach(async ({ request }) => resetDocument(request));

test("browser uses document open and save without JSON transfer controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open map file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save map file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Help" })).toBeVisible();
  await expect(page.locator(".top-actions button").last()).toContainText("Help");
  await expect(page.locator(".top-actions .button-icon")).toHaveCount(7);
  await page.getByRole("button", { name: "Help" }).click();
  await expect(page.getByRole("heading", { name: "Top bar buttons" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visualizing a source document" })).toBeVisible();
  await expect(page.getByText("Select any box to open its details in the panel on the right", { exact: false })).toBeVisible();
  await expect(page.getByText("does not replace or save the original", { exact: false })).toBeVisible();
  await expect(page.getByText(/Tuo JSON|Vie JSON/)).toHaveCount(0);
  await expect(page.locator(".workspace-status")).toContainText("semantic-logic-map.docx");
});

test("maps can be listed, opened and deleted individually", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Maps (1)" }).click();
  await expect(page.getByText("M1 · ACTIVE")).toBeVisible();
  await page.getByLabel("Name").fill("Incident handling");
  await page.getByRole("button", { name: "Create and open" }).click();
  await expect(page.getByRole("button", { name: "Maps (2)" })).toBeVisible();

  await page.getByRole("button", { name: "Maps (2)" }).click();
  const firstMap = page.locator(".map-card").filter({ hasText: "M1" });
  await firstMap.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("button", { name: "Maps (2)" })).toBeVisible();

  await page.getByRole("button", { name: "Maps (2)" }).click();
  const secondMap = page.locator(".map-card").filter({ hasText: "Incident handling" });
  page.once("dialog", dialog => dialog.accept());
  await secondMap.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: "Maps (1)" })).toBeVisible();
  await expect(page.getByText("Incident handling")).toHaveCount(0);
});

test("a diagram can be saved in DOCX and reopened from the same file", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore an example" }).click();
  await expect(page.locator(".contract-node")).toHaveCount(6);
  await expect(page.locator(".edge-start-arrow")).toHaveCount(6);
  const sourceHandleStyle = await page.locator('.react-flow__handle.source').first().getAttribute("style");
  expect(sourceHandleStyle).toMatch(/-10px/);
  await expect(page.locator(".workspace-status")).toContainText("unsaved changes");

  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save map file" }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const docx = Buffer.concat(chunks);
  expect(docx.subarray(0, 2).toString()).toBe("PK");
  await expect(page.locator(".workspace-status")).toContainText("saved");

  await resetDocument(request);
  await expect(page.locator(".contract-node")).toHaveCount(0);
  await page.getByLabel("Open Semantic Logic Mapper DOCX file").setInputFiles({
    name: "sopimuskartta.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx,
  });
  await expect(page.locator(".contract-node")).toHaveCount(6);
  await expect(page.locator(".workspace-status")).toContainText("sopimuskartta.docx");
});

test("invalid DOCX leaves the current diagram intact", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore an example" }).click();
  await expect(page.locator(".contract-node")).toHaveCount(6);
  await page.getByLabel("Open Semantic Logic Mapper DOCX file").setInputFiles({
    name: "broken.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("not a zip"),
  });
  await expect(page.getByRole("alert")).toContainText("valid DOCX");
  await expect(page.locator(".contract-node")).toHaveCount(6);
});

test("stale inspector edits cannot overwrite an external correction", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore an example" }).click();
  await page.locator('.react-flow__node[data-id="N1"]').click();
  await page.getByRole("button", { name: "Edit box" }).click();
  await page.getByLabel("Title", { exact: true }).fill("My unfinished title");
  const current = await state(request);
  await request.post("/api/changes", {
    data: {
      expectedRevision: current.model.revision,
      summary: "Ulkoinen korjaus",
      operations: [{ type: "update_node", id: "N1", changes: { title: "Ulkoinen nimi" } }],
    },
  });
  await expect(page.getByText("The map changed while you were editing.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("My unfinished title");
  await expect(page.getByRole("button", { name: "Save box" })).toBeDisabled();
});
