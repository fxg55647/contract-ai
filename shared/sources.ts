import { z } from "zod";

export const sourceDocumentIdSchema = z
  .string()
  .regex(/^D[1-9]\d{0,5}$/, "A source document identifier must look like D1.");
export const sourceFragmentIdSchema = z
  .string()
  .regex(/^D[1-9]\d{0,5}-F[1-9]\d{0,5}$/, "A source excerpt identifier must look like D1-F2.");

export const sourceFragmentSchema = z.object({
  id: sourceFragmentIdSchema,
  order: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  heading: z.string().max(200),
  text: z.string().min(1).max(2400),
  locator: z.string().min(1).max(500).optional(),
}).strict();

export const liveSourceApplicationSchema = z.enum([
  "libreoffice-writer",
  "microsoft-word",
]);

export const liveSourceOriginSchema = z.object({
  kind: z.literal("live-document"),
  application: liveSourceApplicationSchema,
  externalDocumentId: z.string().min(1).max(500),
}).strict();

export const sourceDocumentSchema = z.object({
  id: sourceDocumentIdSchema,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(60_000),
  fingerprint: z.string().regex(/^[a-f0-9]{8}$/),
  messageId: z.string(),
  createdAt: z.string(),
  fragments: z.array(sourceFragmentSchema).min(1).max(500),
  origin: liveSourceOriginSchema.optional(),
}).strict();

export const sourceReferenceSchema = z.object({
  documentId: sourceDocumentIdSchema,
  fragmentId: sourceFragmentIdSchema,
  quote: z.string().min(1).max(2400).refine(value => value.trim().length > 0).optional(),
}).strict();

export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
export type SourceFragment = z.infer<typeof sourceFragmentSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;

/** A source fragment can support a node once, regardless of how it was added. */
export function uniqueSourceReferences(references: SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.documentId}:${reference.fragmentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type Range = { start: number; end: number };

function trimRange(content: string, range: Range): Range | null {
  let { start, end } = range;
  while (start < end && /\s/.test(content[start])) start++;
  while (end > start && /\s/.test(content[end - 1])) end--;
  return end > start ? { start, end } : null;
}

function splitLongRange(content: string, range: Range, maxChars: number): Range[] {
  const ranges: Range[] = [];
  let start = range.start;
  while (range.end - start > maxChars) {
    const window = content.slice(start, start + maxChars + 1);
    const candidates = [
      window.lastIndexOf("\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf("; "),
      window.lastIndexOf(", "),
      window.lastIndexOf(" "),
    ];
    const preferred = candidates.find((index) => index >= Math.floor(maxChars * 0.55));
    const relativeEnd = preferred !== undefined ? preferred + 1 : maxChars;
    const part = trimRange(content, { start, end: start + relativeEnd });
    if (part) ranges.push(part);
    start += relativeEnd;
  }
  const tail = trimRange(content, { start, end: range.end });
  if (tail) ranges.push(tail);
  return ranges;
}

export function sourceFingerprint(content: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fragmentHeading(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0].trim();
  if (firstLine.length <= 200 && /^(?:\d+(?:\.\d+)*[.)]?|§|[A-ZÅÄÖ][A-ZÅÄÖ\s-]{3,})\s*/.test(firstLine)) return firstLine;
  return "";
}

/** Split an immutable source into exact, addressable excerpts without rewriting its text. */
export function splitSourceText(content: string, maxChars = 1400): Omit<SourceFragment, "id" | "order">[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (maxChars < 300 || maxChars > 2400) throw new Error("The excerpt limit must be between 300 and 2,400 characters.");

  const offset = content.indexOf(trimmed);
  const blockRanges: Range[] = [];
  const boundaries = new Set<number>([offset, offset + trimmed.length]);
  const separator = /\r?\n[ \t]*\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(content)) && match.index < offset + trimmed.length) {
    boundaries.add(separator.lastIndex);
  }
  const headingLine = /^[ \t]*(?:(?:\d+(?:\.\d+)+|\d+[.)]|§\s*\d+)\s+\S|[A-ZÅÄÖ][A-ZÅÄÖ0-9 /&-]{3,}$)/gm;
  while ((match = headingLine.exec(content)) && match.index < offset + trimmed.length) {
    if (match.index > offset) boundaries.add(match.index);
  }
  const ordered = [...boundaries].sort((a, b) => a - b);
  for (let index = 0; index < ordered.length - 1; index++) {
    const block = trimRange(content, { start: ordered[index], end: ordered[index + 1] });
    if (block) blockRanges.push(block);
  }

  const split = blockRanges.flatMap((range) => splitLongRange(content, range, maxChars));
  const merged: Range[] = [];
  for (const range of split) {
    const previous = merged.at(-1);
    if (previous && range.end - previous.start <= maxChars && previous.end - previous.start < 220 && !fragmentHeading(content.slice(previous.start, previous.end))) {
      previous.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged.map((range) => {
    const text = content.slice(range.start, range.end);
    return { ...range, heading: fragmentHeading(text), text };
  });
}

export function createSourceDocument(content: string, number: number, messageId: string, createdAt = new Date().toISOString()): SourceDocument {
  const id = `D${number}`;
  const fragments = splitSourceText(content).map((fragment, order) => ({ ...fragment, id: `${id}-F${order + 1}`, order }));
  if (!fragments.length) throw new Error("An empty text cannot form a source document.");
  const firstHeading = fragments.find((fragment) => fragment.heading)?.heading;
  return sourceDocumentSchema.parse({
    id,
    title: firstHeading || `Attached source text ${number}`,
    content,
    fingerprint: sourceFingerprint(content),
    messageId,
    createdAt,
    fragments,
  });
}

export type LiveSourceExcerptInput = {
  locator: string;
  heading?: string;
  quote: string;
};

/** Store only cited excerpts and their live-document locators, never the whole source file. */
export function createLiveSourceDocument(
  input: {
    title: string;
    application: z.infer<typeof liveSourceApplicationSchema>;
    externalDocumentId: string;
    excerpts: LiveSourceExcerptInput[];
  },
  number: number,
  createdAt = new Date().toISOString(),
): SourceDocument {
  const id = `D${number}`;
  let content = "";
  const fragments = input.excerpts.map((excerpt, order) => {
    if (order > 0) content += "\n\n";
    const start = content.length;
    content += excerpt.quote;
    return {
      id: `${id}-F${order + 1}`,
      order,
      start,
      end: content.length,
      heading: excerpt.heading?.trim() ?? "",
      text: excerpt.quote,
      locator: excerpt.locator,
    };
  });
  return sourceDocumentSchema.parse({
    id,
    title: input.title,
    content,
    fingerprint: sourceFingerprint(content),
    messageId: "",
    createdAt,
    fragments,
    origin: {
      kind: "live-document",
      application: input.application,
      externalDocumentId: input.externalDocumentId,
    },
  });
}
