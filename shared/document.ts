import { z } from "zod";
import { modelSchema } from "./model";
import { sourceDocumentSchema } from "./sources";

export const mapIdSchema = z.string().regex(/^M[1-9]\d{0,5}$/, "A map identifier must look like M2.");
export const draftSchema = z.object({ text: z.string().max(120_000), revision: z.number().int().nonnegative() }).nullable();
export const storedMapSchema = z.object({
  id: mapIdSchema,
  model: modelSchema,
  draft: draftSchema,
}).strict();

export const embeddedDocumentV1Schema = z.object({
  format: z.literal("sopimuskartta-docx"),
  formatVersion: z.literal(1),
  documentId: z.string().uuid(),
  model: modelSchema,
  sourceDocuments: z.array(sourceDocumentSchema).max(100),
  draft: draftSchema,
  documentTextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const embeddedDocumentV2Schema = z.object({
  format: z.literal("sopimuskartta-docx"),
  formatVersion: z.literal(2),
  documentId: z.string().uuid(),
  maps: z.array(storedMapSchema).min(1).max(100),
  activeMapId: mapIdSchema,
  sourceDocuments: z.array(sourceDocumentSchema).max(100),
  documentTextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(
  value => value.maps.some(map => map.id === value.activeMapId),
  "The active map must exist in the map file.",
);

export const embeddedDocumentSchema = z.union([embeddedDocumentV2Schema, embeddedDocumentV1Schema]);

export type EmbeddedDocument = z.infer<typeof embeddedDocumentSchema>;
export type EmbeddedDocumentV2 = z.infer<typeof embeddedDocumentV2Schema>;
export type StoredMap = z.infer<typeof storedMapSchema>;

export type DocumentStatus = {
  id: string;
  fileName: string;
  dirty: boolean;
  textChanged: boolean;
};
