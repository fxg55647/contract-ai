import { test, expect } from "@playwright/test";
import { WorkspaceStore } from "../../server/store";
import { newNode } from "../../shared/model";

test("source text and exact quote travel inside the opened DOCX", async ({ page, request }) => {
  const store = new WorkspaceStore();
  const source = store.addSourceDocument("1. Delivery\nThe supplier delivers within 14 days.", "", "Demo agreement");
  const node = newNode("N1", { x: 80, y: 60 });
  node.title = "Delivery";
  node.sourceRefs = [{
    documentId: source.id,
    fragmentId: source.fragments[0].id,
    quote: "The supplier delivers within 14 days.",
  }];
  store.apply({ expectedRevision: 0, summary: "Source-backed node", operations: [{ type: "add_node", node }] }, "test");
  const document = await store.saveDocument();

  await page.goto("/");
  await page.getByLabel("Open Semantic Logic Mapper DOCX file").setInputFiles({
    name: "agreement.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: document.buffer,
  });
  await expect(page.locator(".workspace-status")).toContainText("agreement.docx · saved");
  await expect.poll(async () => {
    const state = await (await request.get("/api/state")).json();
    return state.model.nodes[0]?.sourceRefs?.[0]?.quote;
  }).toBe("The supplier delivers within 14 days.");
  await page.locator('.react-flow__node[data-id="N1"]').click();
  await expect(page.getByRole("complementary", { name: "Box details" }).locator("blockquote").first()).toContainText("The supplier delivers within 14 days.");
  await expect(page.getByText("1. Delivery", { exact: true })).toBeVisible();
});
