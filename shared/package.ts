import { z } from 'zod';
import { modelSchema } from './model';
import { sourceDocumentSchema } from './sources';

export const packageSchema = z.object({
  format: z.literal('contract-map'),
  formatVersion: z.literal(1),
  model: modelSchema,
  sourceDocuments: z.array(sourceDocumentSchema).max(100),
}).strict();
