import { z } from "zod";
import { modelSchema } from "./model";
import { sourceDocumentSchema } from "./sources";

export const embeddedDocumentSchema = z.object({
  format: z.literal("sopimuskartta-docx"),
  formatVersion: z.literal(1),
  documentId: z.string().uuid(),
  model: modelSchema,
  sourceDocuments: z.array(sourceDocumentSchema).max(100),
  draft: z.object({ text: z.string().max(120_000), revision: z.number().int().nonnegative() }).nullable(),
  documentTextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type EmbeddedDocument = z.infer<typeof embeddedDocumentSchema>;

export type DocumentStatus = {
  id: string;
  fileName: string;
  dirty: boolean;
  textChanged: boolean;
};
