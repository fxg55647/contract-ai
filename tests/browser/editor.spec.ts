import { test, expect, type APIRequestContext } from "@playwright/test";
import { emptyModel, type Workspace } from "../../shared/model";
import { exampleModel } from "../../shared/example";

test("crowded cards and labels spread without overlaps in both views", async ({
  page,
  request,
}) => {
  const model = exampleModel();
  model.nodes.forEach((n) => {
    n.position = { x: 0, y: 0 };
    n.title = "Pitkä ja ymmärrettävä otsikko sopimuksen vaiheesta";
    n.text = "Täsmennettävä asia. ".repeat(25);
  });
  model.edges.forEach((e) => {
    e.label =
      "Jos sovitut edellytykset täyttyvät ja ilmoitus on vastaanotettu määräajassa";
  });
  const current = await state(request);
  expect(
    (
      await request.post("/api/import", {
        data: { expectedRevision: current.model.revision, model },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  for (const compact of [false, true]) {
    if (compact)
      await page
        .getByRole("button", { name: "Yleiskuva", exact: true })
        .click();
    await expect(page.locator(".contract-node")).toHaveCount(6);
    await expect(page.getByRole("button", { name: /^Yhteys / })).toHaveCount(6);
    await expect
      .poll(() =>
        page
          .locator(".react-flow__node")
          .evaluateAll((elements) => {
            const boxes = elements.map((e) => e.getBoundingClientRect());
            return boxes.some((a, i) =>
              boxes
                .slice(i + 1)
                .some(
                  (b) =>
                    a.left < b.right - 1 &&
                    a.right > b.left + 1 &&
                    a.top < b.bottom - 1 &&
                    a.bottom > b.top + 1,
                ),
            );
          }),
      )
      .toBe(false);
  }
});

test("path and detail panels reserve space on desktop, tablet and mobile", async ({
  page,
  request,
}) => {
  const current = await state(request);
  await request.post("/api/import", {
    data: { expectedRevision: current.model.revision, model: exampleModel() },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Käy polku läpi" }).click();
  await request.post("/api/selection", { data: { id: "N4" } });
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".inspector")).toBeVisible();
    const canvas = await page.locator(".canvas-interaction").boundingBox();
    for (const selector of [".walk-panel", ".inspector"]) {
      const panel = await page.locator(selector).boundingBox();
      expect(
        canvas!.x < panel!.x + panel!.width - 1 &&
          canvas!.x + canvas!.width > panel!.x + 1 &&
          canvas!.y < panel!.y + panel!.height - 1 &&
          canvas!.y + canvas!.height > panel!.y + 1,
      ).toBe(false);
    }
  }
});

async function state(request: APIRequestContext): Promise<Workspace> {
  return (await request.get("/api/state")).json();
}
test.beforeEach(async ({ request }) => {
  const current = await state(request);
  const response = await request.post("/api/import", {
    data: { expectedRevision: current.model.revision, model: emptyModel() },
  });
  expect(response.ok()).toBeTruthy();
});
test("open label can be removed and added while structural actions stay model-only", async ({
  page,
  request,
}) => {
  const current = await state(request);
  await request.post("/api/import", {
    data: { expectedRevision: current.model.revision, model: exampleModel() },
  });
  await page.goto("/");
  await page.locator('.react-flow__node[data-id="N1"]').click();
  await expect(page.getByRole("button", { name: "Poista vaihe ja sen yhteydet" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aseta aluksi" })).toHaveCount(0);

  await page.getByRole("button", { name: "Muokkaa vaihetta" }).click();
  await page.getByRole("button", { name: "Poista Avoin-merkintä" }).click();
  await page.getByRole("button", { name: "Tallenna vaihe" }).click();
  await expect.poll(async () => (await state(request)).model.nodes[0].open).toBe(false);

  await page.getByRole("button", { name: "Muokkaa vaihetta" }).click();
  await page.getByRole("button", { name: "+ Merkitse avoimeksi" }).click();
  await page.getByRole("button", { name: "Tallenna vaihe" }).click();
  await expect.poll(async () => (await state(request)).model.nodes[0].open).toBe(true);
});
test("create, edit, add siblings, remove through the model and undo", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Uusi sopimusrakenne" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aloita tyhjästä" }).click();
  await expect(
    page.getByRole("button", { name: "Muokkaa vaihetta" }),
  ).toBeVisible();
  const id = (await state(request)).model.nodes[0].id;
  await page.getByRole("button", { name: "Muokkaa vaihetta" }).click();
  await page
    .getByLabel("Otsikko", { exact: true })
    .fill("Ilmoitus viivästyksestä");
  await page
    .getByLabel("Sisältö")
    .fill("Asiakas ilmoittaa viivästyksestä kirjallisesti.");
  await page.getByRole("button", { name: "Tallenna vaihe" }).click();
  await expect(page.locator(".contract-node h3")).toHaveText(
    "Ilmoitus viivästyksestä",
  );
  await page.getByRole("button", { name: "Sulje vaiheen tiedot" }).click();
  const node = page.locator(`.react-flow__node[data-id="${id}"]`);
  await node.hover();
  await page
    .getByRole("button", {
      name: `Lisää vaihe noden ${id} jälkeen`,
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await state(request)).model.nodes.length)
    .toBe(2);
  await node.hover();
  await page
    .getByRole("button", {
      name: `Lisää vaihe noden ${id} jälkeen`,
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await state(request)).model.nodes.length)
    .toBe(3);
  const nodes = (await state(request)).model.nodes;
  expect(nodes[1].position).not.toEqual(nodes[2].position);
  expect(nodes[0].position).toEqual({ x: 80, y: 60 });
  await node.click();
  await expect(page.getByRole("button", { name: "Poista vaihe ja sen yhteydet" })).toHaveCount(0);
  const beforeDelete = await state(request);
  await request.post("/api/changes", {
    data: {
      expectedRevision: beforeDelete.model.revision,
      summary: "LLM poisti vaiheen",
      operations: [{ type: "delete_node", id }],
    },
  });
  await expect
    .poll(async () => (await state(request)).model.edges.length)
    .toBe(0);
  await page.getByRole("button", { name: "Kumoa", exact: true }).click();
  await expect
    .poll(async () => (await state(request)).model.edges.length)
    .toBe(2);
});
test("external changes are live in two views; open issues survive presentation and manual path walking", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/");
  const second = await context.newPage();
  await second.goto("/");
  const current = await state(request);
  await request.post("/api/import", {
    data: { expectedRevision: current.model.revision, model: exampleModel() },
  });
  await expect(page.locator(".contract-node")).toHaveCount(6);
  await expect(second.locator(".contract-node")).toHaveCount(6);
  await request.post("/api/selection", { data: { id: "N4" } });
  await expect(page.locator(".inspector-title")).toHaveText(
    "Aika korjata viivästys",
  );
  await expect(second.locator(".inspector-title")).toHaveText(
    "Aika korjata viivästys",
  );
  await page.getByRole("button", { name: "Sulje vaiheen tiedot" }).click();
  await page.getByRole("button", { name: "Esitysnäkymä", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Keskustelu", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "4 avointa asiaa" }),
  ).toBeVisible();
  await expect(page.locator(".node-add")).toHaveCount(0);
  await page.getByRole("button", { name: "Käy polku läpi" }).click();
  await page.getByRole("button", { name: "Toimitus viivästyy →" }).click();
  await expect(page.locator(".walk-panel h3")).toHaveText(
    "Ilmoitus viivästyksestä",
  );
  await expect(page.locator(".walk-open")).toContainText("Kenelle");
  await page.screenshot({ path: "test-results/presentation.png" });
});
test("stale inspector edits cannot silently overwrite an external correction", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Aloita tyhjästä" }).click();
  await page.getByRole("button", { name: "Muokkaa vaihetta" }).click();
  await page.getByLabel("Otsikko", { exact: true }).fill("Oma keskeneräinen nimi");
  const current = await state(request);
  await request.post("/api/changes", {
    data: {
      expectedRevision: current.model.revision,
      summary: "Ulkoinen korjaus",
      operations: [
        {
          type: "update_node",
          id: current.model.nodes[0].id,
          changes: { title: "Ulkoinen nimi" },
        },
      ],
    },
  });
  await expect(
    page.getByText("Rakenne muuttui muokkauksen aikana.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Otsikko", { exact: true })).toHaveValue(
    "Oma keskeneräinen nimi",
  );
  await expect(
    page.getByRole("button", { name: "Tallenna vaihe" }),
  ).toBeDisabled();
});
test("dragging a target handle to empty canvas creates an incoming edge", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Aloita tyhjästä" }).click();
  await page.getByRole("button", { name: "Sulje vaiheen tiedot" }).click();
  const id = (await state(request)).model.nodes[0].id;
  await page.getByRole("button", { name: "Sovita", exact: false }).click();
  const target = page.locator(
    `.react-flow__node[data-id="${id}"] .react-flow__handle-top`,
  );
  await expect(target).toBeVisible();
  await page.waitForTimeout(500);
  const box = await target.boundingBox();
  const pane = await page.locator(".react-flow__pane").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(pane!.x + 80, pane!.y + 70, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await state(request)).model.nodes.length)
    .toBe(2);
  const edge = (await state(request)).model.edges[0];
  expect(edge.target).toBe(id);
  expect(edge.source).not.toBe(id);
});
test("long pasted text can be visualized and an API failure preserves input", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Yhteysasetukset" }).click();
  await page.getByLabel("API-avain", { exact: true }).fill("test-only");
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Testin mallipalvelu ei vastaa" }),
    }),
  );
  const text = "1. Toimittaja toimittaa tuotteen. ".repeat(30);
  await page.getByLabel("Viesti tai sopimusteksti", { exact: true }).fill(text);
  await page
    .getByRole("button", { name: "Visualisoi teksti rakenteeksi" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Testin mallipalvelu");
  await expect(
    page.getByLabel("Viesti tai sopimusteksti", { exact: true }),
  ).toHaveValue(text);
});

test("touch drag to empty space creates a finite, correctly directed node", async ({
  browser,
  request,
  baseURL,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  try {
    await page.goto(baseURL!);
    await page.getByRole("button", { name: "Aloita tyhjästä" }).click();
    await page.getByRole("button", { name: "Sulje vaiheen tiedot" }).click();
    const id = (await state(request)).model.nodes[0].id;
    await page.getByRole("button", { name: "Sovita", exact: false }).click();
    await page.waitForTimeout(500);
    const handle = await page
      .locator(`.react-flow__node[data-id="${id}"] .react-flow__handle-bottom`)
      .boundingBox();
    const pane = await page.locator(".react-flow__pane").boundingBox();
    const cdp = await context.newCDPSession(page);
    const start = {
      x: handle!.x + handle!.width / 2,
      y: handle!.y + handle!.height / 2,
    };
    const end = { x: pane!.x + 70, y: pane!.y + 80 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    for (let i = 1; i <= 6; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * i) / 6,
            y: start.y + ((end.y - start.y) * i) / 6,
          },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await state(request)).model.nodes.length)
      .toBe(2);
    const next = (await state(request)).model;
    expect(next.edges[0].source).toBe(id);
    expect(Number.isFinite(next.nodes[1].position.x)).toBeTruthy();
    expect(Number.isFinite(next.nodes[1].position.y)).toBeTruthy();
  } finally {
    await context.close();
  }
});

test("keyboard movement persists and overview never changes saved positions", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Aloita tyhjästä" }).click();
  const initial = (await state(request)).model.nodes[0];
  const node = page.locator(`.react-flow__node[data-id="${initial.id}"]`);
  await node.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await state(request)).model.nodes[0].position.x)
    .toBe(initial.position.x + 5);
  const moved = (await state(request)).model.nodes[0].position;
  await page.getByRole("button", { name: "Yleiskuva", exact: true }).click();
  expect((await state(request)).model.nodes[0].position).toEqual(moved);
  await page.reload();
  await expect(page.locator(".contract-node")).toHaveCount(1);
  expect((await state(request)).model.nodes[0].position).toEqual(moved);
});
