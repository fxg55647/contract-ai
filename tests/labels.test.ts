import { test } from "node:test";
import assert from "node:assert/strict";
import { overlaps, placeLabels } from "../shared/layout";

test("labels avoid both endpoint arrows, including their own", () => {
  const arrows = [0, 70].map(y => ({ id: `arrow-${y}`, x: 0, y, width: 56, height: 56 }));
  const labels = placeLabels([{ id: "label", ownerId: "a", x: 0, y: 0, width: 100, height: 24 }], [], 7, arrows);
  assert.ok(arrows.every(arrow => !overlaps(labels[0], arrow, 7)));
});

test("crowded labels never fall back to unchecked overlapping positions", () => {
  const obstacle = { id: "large", x: -100, y: -1000, width: 1000, height: 2000 };
  const labels = placeLabels(Array.from({ length: 3 }, (_, i) => ({
    id: `label-${i}`, x: 0, y: 0, width: 100, height: 24,
  })), [], 7, [obstacle]);
  labels.forEach((label, i) => {
    assert.ok(!overlaps(label, obstacle, 7));
    labels.slice(i + 1).forEach(other => assert.ok(!overlaps(label, other, 7)));
  });
});
