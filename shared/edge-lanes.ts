/** Allocate nearby parallel bend tracks only when their spans overlap. */
export function allocateEdgeLanes<T extends {
  id: string; horizontal: boolean; center: number; from: number; to: number;
}>(tracks: T[], gap = 18): Map<string, number> {
  const placed: (T & { coordinate: number })[] = [];
  const result = new Map<string, number>();
  for (const track of [...tracks].sort((a, b) => a.id.localeCompare(b.id))) {
    let coordinate = track.center;
    const conflicts = (candidate: number) => placed.some(other =>
      other.horizontal === track.horizontal &&
      Math.max(Math.min(track.from, track.to), Math.min(other.from, other.to)) <=
        Math.min(Math.max(track.from, track.to), Math.max(other.from, other.to)) + gap &&
      Math.abs(candidate - other.coordinate) < gap);
    for (let ring = 1; conflicts(coordinate); ring++) {
      coordinate = track.center + (ring % 2 ? 1 : -1) * Math.ceil(ring / 2) * gap;
    }
    placed.push({ ...track, coordinate });
    result.set(track.id, coordinate - track.center);
  }
  return result;
}
