import { z } from "zod";
import { sourceReferenceSchema, type SourceDocument } from "./sources";

const text = z.string().trim().min(1).max(4000);
export const nodeIdSchema = z
  .string()
  .regex(/^N[1-9]\d{0,5}$/, "Node-tunnisteen on oltava esimerkiksi N7.");
const positionSchema = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();
export const nodeSchema = z
  .object({
    id: nodeIdSchema,
    title: text.max(100),
    text: z.string().max(10_000),
    open: z.boolean(),
    sourceRefs: z.array(sourceReferenceSchema).max(32),
    position: positionSchema,
  })
  .strict();
export const edgeSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    source: nodeIdSchema,
    target: nodeIdSchema,
    label: z.string().max(160),
  })
  .strict();
export const modelSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    nextNodeNumber: z.number().int().positive().max(999999),
    title: text.max(160),
    entry: nodeIdSchema.nullable(),
    nodes: z.array(nodeSchema).max(200),
    edges: z.array(edgeSchema).max(500),
  })
  .strict();
export type ContractNode = z.infer<typeof nodeSchema>;
export type ContractEdge = z.infer<typeof edgeSchema>;
export type ContractModel = z.infer<typeof modelSchema>;
export const operationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("add_node"),
      node: nodeSchema
        .omit({ position: true })
        .extend({ position: positionSchema.optional() }),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_node"),
      id: nodeIdSchema,
      changes: nodeSchema.omit({ id: true }).partial(),
    })
    .strict(),
  z.object({ type: z.literal("delete_node"), id: nodeIdSchema }).strict(),
  z.object({ type: z.literal("add_edge"), edge: edgeSchema }).strict(),
  z
    .object({
      type: z.literal("update_edge"),
      id: z.string(),
      label: z.string().max(160),
    })
    .strict(),
  z.object({ type: z.literal("delete_edge"), id: z.string() }).strict(),
  z
    .object({ type: z.literal("set_entry"), id: nodeIdSchema.nullable() })
    .strict(),
  z.object({ type: z.literal("set_title"), title: text.max(160) }).strict(),
]);
export const proposalSchema = z
  .object({
    summary: text.max(1000),
    operations: z.array(operationSchema).min(1).max(800),
  })
  .strict();
export const patchSchema = proposalSchema
  .extend({ expectedRevision: z.number().int().nonnegative() })
  .strict();
export type Operation = z.infer<typeof operationSchema>;
export type Patch = z.infer<typeof patchSchema>;
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
export type Change = {
  revision: number;
  summary: string;
  actor: string;
  added: string[];
  updated: string[];
  removed: string[];
};
export type Workspace = {
  model: ContractModel;
  messages: Message[];
  sourceDocuments: SourceDocument[];
  selection: string | null;
  draft: { text: string; revision: number } | null;
  lastChange: Change | null;
  history: Change[];
  canUndo: boolean;
  canRedo: boolean;
  aiConfigured: boolean;
  document: import("./document").DocumentStatus;
};
export class ModelError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function emptyModel(): ContractModel {
  return {
    revision: 0,
    nextNodeNumber: 1,
    title: "Uusi sopimusrakenne",
    entry: null,
    nodes: [],
    edges: [],
  };
}
export function validateModel(input: unknown): ContractModel {
  const m = modelSchema.parse(input);
  const ids = new Set(m.nodes.map((n) => n.id));
  if (ids.size !== m.nodes.length)
    throw new ModelError("Node-tunnisteet eivät ole yksilöllisiä.");
  if (m.nodes.length && (!m.entry || !ids.has(m.entry)))
    throw new ModelError("Valitse olemassa oleva aloitusnode.");
  if (!m.nodes.length && m.entry)
    throw new ModelError("Tyhjällä mallilla ei voi olla aloitusnodea.");
  if (m.nodes.some((n) => Number(n.id.slice(1)) >= m.nextNodeNumber))
    throw new ModelError("Seuraava node-tunniste ei ole vapaa.");
  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const e of m.edges) {
    if (!ids.has(e.source) || !ids.has(e.target))
      throw new ModelError(`Yhteys ${e.id} viittaa puuttuvaan nodeen.`);
    if (e.source === e.target)
      throw new ModelError("Nodea ei voi yhdistää itseensä.");
    const pair = `${e.source}:${e.target}`;
    if (edgeIds.has(e.id) || pairs.has(pair))
      throw new ModelError("Sama yhteys on jo olemassa.");
    edgeIds.add(e.id);
    pairs.add(pair);
  }
  return m;
}
export function freePosition(
  nodes: ContractNode[],
  desired = { x: 80, y: 60 },
) {
  const position = { ...desired };
  while (
    nodes.some(
      (n) =>
        Math.abs(n.position.x - position.x) < 440 &&
        Math.abs(n.position.y - position.y) < 360,
    )
  )
    position.x += 480;
  return position;
}
export function newNode(
  id: string,
  position: { x: number; y: number },
): ContractNode {
  return {
    id,
    title: "Uusi vaihe",
    text: "",
    open: false,
    sourceRefs: [],
    position,
  };
}
export function applyPatch(
  model: ContractModel,
  input: unknown,
): ContractModel {
  const patch = patchSchema.parse(input);
  if (patch.expectedRevision !== model.revision)
    throw new ModelError(
      "Rakenne muuttui toisessa näkymässä. Tarkista uusin versio ja tee muutos uudelleen.",
      409,
    );
  const m = structuredClone(model);
  const allocated = new Set(m.nodes.map((n) => n.id));
  const automatic = new Set<string>();
  for (const op of patch.operations) {
    switch (op.type) {
      case "add_node": {
        if (
          allocated.has(op.node.id) ||
          Number(op.node.id.slice(1)) < model.nextNodeNumber
        )
          throw new ModelError(
            `Tunniste ${op.node.id} on jo käytetty. Käytä seuraavaa vapaata tunnistetta.`,
          );
        allocated.add(op.node.id);
        if (!op.node.position) automatic.add(op.node.id);
        m.nodes.push({
          ...op.node,
          position: op.node.position ?? freePosition(m.nodes),
        });
        m.nextNodeNumber = Math.max(
          m.nextNodeNumber,
          Number(op.node.id.slice(1)) + 1,
        );
        if (!m.entry) m.entry = op.node.id;
        break;
      }
      case "update_node": {
        const node = m.nodes.find((n) => n.id === op.id);
        if (!node) throw new ModelError(`Nodea ${op.id} ei löydy.`);
        Object.assign(node, op.changes);
        break;
      }
      case "delete_node":
        if (!m.nodes.some((n) => n.id === op.id))
          throw new ModelError(`Nodea ${op.id} ei löydy.`);
        m.nodes = m.nodes.filter((n) => n.id !== op.id);
        m.edges = m.edges.filter(
          (e) => e.source !== op.id && e.target !== op.id,
        );
        if (m.entry === op.id) m.entry = m.nodes[0]?.id ?? null;
        break;
      case "add_edge":
        m.edges.push(op.edge);
        break;
      case "update_edge": {
        const edge = m.edges.find((e) => e.id === op.id);
        if (!edge) throw new ModelError("Yhteyttä ei löydy.");
        edge.label = op.label;
        break;
      }
      case "delete_edge":
        if (!m.edges.some((e) => e.id === op.id))
          throw new ModelError("Yhteyttä ei löydy.");
        m.edges = m.edges.filter((e) => e.id !== op.id);
        break;
      case "set_entry":
        m.entry = op.id;
        break;
      case "set_title":
        m.title = op.title;
        break;
    }
  }
  // Lay out only new, unpositioned nodes after all edges are known. Existing
  // positions are never regenerated, even when an AI changes the structure.
  const placed = m.nodes.filter((n) => !automatic.has(n.id));
  while (automatic.size) {
    const id =
      [...automatic].find(
        (candidate) =>
          candidate === m.entry ||
          m.edges.some(
            (e) =>
              e.target === candidate && placed.some((n) => n.id === e.source),
          ),
      ) ?? automatic.values().next().value!;
    const node = m.nodes.find((n) => n.id === id);
    automatic.delete(id);
    if (!node) continue;
    const parentEdge = m.edges.find(
      (e) => e.target === id && placed.some((n) => n.id === e.source),
    );
    const parent = placed.find((n) => n.id === parentEdge?.source);
    node.position = freePosition(
      placed,
      parent
        ? { x: parent.position.x, y: parent.position.y + 420 }
        : { x: 80, y: 60 },
    );
    placed.push(node);
  }
  m.revision++;
  return validateModel(m);
}
export function modelWarnings(
  model: ContractModel,
): { nodeId: string; text: string }[] {
  const warnings: { nodeId: string; text: string }[] = [];
  const seen = new Set<string>();
  const queue = model.entry ? [model.entry] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(
      ...model.edges.filter((e) => e.source === id).map((e) => e.target),
    );
  }
  for (const node of model.nodes) {
    const outgoing = model.edges.filter((e) => e.source === node.id);
    if (!seen.has(node.id))
      warnings.push({ nodeId: node.id, text: "Ei polkua aloituskohdasta" });
    if (
      outgoing.length > 1 && outgoing.some((e) => !e.label.trim())
    )
      warnings.push({
        nodeId: node.id,
        text: "Haarautumisen vaihtoehtojen ehdot puuttuvat",
      });
  }
  return warnings;
}
export function difference(
  before: ContractModel,
  after: ContractModel,
  summary: string,
  actor: string,
): Change {
  const old = new Map(before.nodes.map((n) => [n.id, n]));
  const next = new Set(after.nodes.map((n) => n.id));
  const updated = new Set(
    after.nodes
      .filter(
        (n) =>
          old.has(n.id) && JSON.stringify(old.get(n.id)) !== JSON.stringify(n),
      )
      .map((n) => n.id),
  );
  for (const e of [...before.edges, ...after.edges]) {
    const other = (before.edges.includes(e) ? after.edges : before.edges).find(
      (x) => x.id === e.id,
    );
    if (JSON.stringify(e) !== JSON.stringify(other)) {
      if (old.has(e.source) && next.has(e.source)) updated.add(e.source);
      if (old.has(e.target) && next.has(e.target)) updated.add(e.target);
    }
  }
  return {
    revision: after.revision,
    summary,
    actor,
    added: after.nodes.filter((n) => !old.has(n.id)).map((n) => n.id),
    updated: [...updated],
    removed: before.nodes.filter((n) => !next.has(n.id)).map((n) => n.id),
  };
}
