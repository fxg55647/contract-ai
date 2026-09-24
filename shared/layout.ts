export type Point = { x: number; y: number };
export type Box = Point & { id: string; width: number; height: number };

export function overlaps(a: Box, b: Box, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/** Expand the canvas rather than compressing cards. Preserve every clear position. */
export function separateBoxes(
  boxes: Box[],
  horizontalFlow: boolean,
  gap = 120,
): Box[] {
  const placed: Box[] = [];
  for (const original of boxes) {
    const box = { ...original };
    let obstacle: Box | undefined;
    while ((obstacle = placed.find((other) => overlaps(box, other, gap)))) {
      if (horizontalFlow) box.y = obstacle.y + obstacle.height + gap;
      else box.x = obstacle.x + obstacle.width + gap;
    }
    placed.push(box);
  }
  return placed;
}

/** Place wrapped edge labels in free canvas space, including around long return edges. */
export function placeLabels(labels: Box[], nodes: Box[]): Box[] {
  const occupied = [...nodes];
  return labels.map((original) => {
    const label = { ...original };
    let obstacle: Box | undefined;
    while ((obstacle = occupied.find((other) => overlaps(label, other, 14)))) {
      label.x = obstacle.x + obstacle.width + 14;
    }
    occupied.push(label);
    return label;
  });
}
