export type Point = { x: number; y: number };
export type Box = Point & { id: string; width: number; height: number; positionLocked?: boolean };
export type OwnedBox = Box & { ownerId?: string; ownerIds?: string[] };

function ownedBy(obstacle: OwnedBox, id: string) {
  return obstacle.ownerId === id || obstacle.ownerIds?.includes(id);
}

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
  gap = 48,
): Box[] {
  const placed: Box[] = boxes.filter(box => box.positionLocked);
  for (const original of boxes) {
    if (original.positionLocked) continue;
    const box = { ...original };
    let obstacle: Box | undefined;
    while ((obstacle = placed.find((other) => overlaps(box, other, gap)))) {
      if (horizontalFlow) box.y = obstacle.y + obstacle.height + gap;
      else box.x = obstacle.x + obstacle.width + gap;
    }
    placed.push(box);
  }
  return boxes.map(box => placed.find(item => item.id === box.id)!);
}

/** Keep nodes away from fixed edge-label zones; labels stay at their origins. */
export function separateBoxesAroundObstacles(
  boxes: Box[],
  obstacles: OwnedBox[],
  horizontalFlow: boolean,
  gap = 18,
  nodeGap = 48,
): Box[] {
  const placed: Box[] = [];
  for (const original of boxes) {
    if (original.positionLocked) { placed.push(original); continue; }
    let box = { ...original };
    const otherBoxes = boxes.filter(item => item.id !== box.id)
      .map(item => placed.find(previous => previous.id === item.id) ?? item);
    for (let pass = 0; pass < obstacles.length + 1; pass++) {
      const obstacle = obstacles.find(item => !ownedBy(item, box.id) && overlaps(box, item, gap));
      if (!obstacle) break;
      const candidates = horizontalFlow
        ? [
            { ...box, y: obstacle.y + obstacle.height + gap },
            { ...box, y: obstacle.y - box.height - gap },
            { ...box, x: obstacle.x + obstacle.width + gap },
            { ...box, x: obstacle.x - box.width - gap },
          ]
        : [
            { ...box, x: obstacle.x + obstacle.width + gap },
            { ...box, x: obstacle.x - box.width - gap },
            { ...box, y: obstacle.y + obstacle.height + gap },
            { ...box, y: obstacle.y - box.height - gap },
          ];
      box = candidates
        .filter(candidate => obstacles.every(item => ownedBy(item, candidate.id) || !overlaps(candidate, item, gap)))
        .filter(candidate => otherBoxes.every(item => !overlaps(candidate, item, nodeGap)))
        .sort((a, b) => Math.hypot(a.x - original.x, a.y - original.y) - Math.hypot(b.x - original.x, b.y - original.y))[0]
        ?? box;
      // Never accept an unchecked fallback or repeatedly drift on an impossible constraint.
      if (overlaps(box, obstacle, gap)) break;
    }
    placed.push(box);
  }
  // Every moved candidate was already checked against previously placed nodes.
  // A final generic separation pass could move it back into a label or route corridor.
  return placed;
}

/** Place wrapped edge labels in free canvas space, including around long return edges. */
export function placeLabels(labels: OwnedBox[], nodes: Box[], gap = 7, arrowZones: Box[] = []): OwnedBox[] {
  const placed: OwnedBox[] = [];
  return labels.map((original) => {
    const step = original.height + gap;
    const candidates: OwnedBox[] = [{ ...original }];
    for (let ring = 1; ring <= 6; ring++) {
      candidates.push(
        { ...original, y: original.y + step * ring },
        { ...original, y: original.y - step * ring },
      );
    }
    const isClear = (candidate: OwnedBox) =>
      nodes.every(node => !overlaps(candidate, node, 10)) &&
      arrowZones.every(arrow => !overlaps(candidate, arrow, gap)) &&
      placed.every(other => !overlaps(candidate, other, gap));
    // Obstacle boundaries provide a finite, guaranteed-clear fallback below
    // all obstacles. Never silently accept an overlapping candidate.
    const obstacles = [...nodes, ...arrowZones, ...placed];
    candidates.push(...obstacles.map(obstacle => ({ ...original,
      y: obstacle.y + obstacle.height + Math.max(10, gap) + 1,
    })).sort((a, b) => Math.abs(a.y - original.y) - Math.abs(b.y - original.y)));
    const label = candidates.find(isClear)!;
    placed.push(label);
    return label;
  });
}
