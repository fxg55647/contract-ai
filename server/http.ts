import express from 'express';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z, ZodError } from 'zod';
import { ModelError, modelWarnings, nodeIdSchema } from '../shared/model';
import { WorkspaceStore } from './store';


const revisionSchema = z.object({ expectedRevision: z.number().int().nonnegative() });
export function createApp(store: WorkspaceStore) {
  const app = express();
  const snapshot = () => store.snapshot();
  app.use((req, res, next) => {
    // Local workspace: reject DNS rebinding and cross-origin browser writes/reads.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) { res.status(403).json({ error: 'Vain paikallinen yhteys sallitaan.' }); return; }
    const origin = req.headers.origin;
    if (origin && !['http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${process.env.PORT || 4317}`, `http://127.0.0.1:${process.env.PORT || 4317}`].includes(origin)) { res.status(403).json({ error: 'Vierasta alkuperää ei sallita.' }); return; }
    res.setHeader('Cache-Control', 'no-store'); next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/state', (_req, res) => res.json(snapshot()));
  app.get('/api/validate', (_req, res) => res.json({ warnings: modelWarnings(snapshot().model) }));
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders();
    const send = () => res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    const unsubscribe = store.subscribe(send); send();
    const timer = setInterval(() => res.write(': heartbeat\n\n'), 20_000);
    req.on('close', () => { clearInterval(timer); unsubscribe(); });
  });
  app.post('/api/changes', (req, res) => { store.apply(req.body, req.headers['x-contract-client'] === 'mcp' ? 'mcp' : 'editor'); res.json(snapshot()); });
  app.post('/api/selection', (req, res) => { store.select(z.object({ id: nodeIdSchema.nullable() }).parse(req.body).id); res.json(snapshot()); });
  app.post('/api/undo', (req, res) => { store.undo(revisionSchema.parse(req.body).expectedRevision); res.json(snapshot()); });
  app.post('/api/redo', (req, res) => { store.undo(revisionSchema.parse(req.body).expectedRevision, true); res.json(snapshot()); });
  app.post('/api/import', (req, res) => { store.restore(req.body.model, revisionSchema.parse(req.body).expectedRevision, 'editor'); res.json(snapshot()); });
  app.post('/api/sources', (req, res) => {
    const input = z.object({ title: z.string().trim().min(1).max(200), content: z.string().min(1).max(60000) }).strict().parse(req.body);
    if (!input.content.trim()) throw new ModelError('Lähdeteksti on tyhjä.');
    const document = store.addSourceDocument(input.content, '', input.title);
    res.json({ documentId: document.id, title: document.title, fragmentCount: document.fragments.length });
  });
  app.get('/api/sources', (_req, res) => res.json(snapshot().sourceDocuments.map(({ id, title, fragments }) => ({ id, title, fragmentCount: fragments.length }))));
  app.get('/api/sources/:id/fragments', (req, res) => {
    const document = snapshot().sourceDocuments.find(d => d.id === req.params.id);
    if (!document) throw new ModelError('Lähdedokumenttia ei löydy.', 404);
    const offset = z.coerce.number().int().min(0).parse(req.query.offset ?? 0);
    const limit = z.coerce.number().int().min(1).max(30).parse(req.query.limit ?? 10);
    res.json({ documentId: document.id, fragments: document.fragments.slice(offset, offset + limit), total: document.fragments.length, nextOffset: offset + limit < document.fragments.length ? offset + limit : null });
  });
  app.get('/api/package', (_req, res) => res.json(store.exportPackage()));
  app.post('/api/package', (req, res) => res.json(store.importPackage(req.body.package, revisionSchema.parse(req.body).expectedRevision)));
  app.post('/api/draft', (req, res) => {
    const input = z.object({ text: z.string().min(1).max(120000), expectedRevision: z.number().int().nonnegative() }).strict().parse(req.body);
    store.setDraft(input.text, input.expectedRevision);
    res.json({ revision: input.expectedRevision, saved: true });
  });
  app.use(express.static(resolve('dist')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof ModelError ? error.status : error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
    const message = error instanceof ZodError ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : error instanceof Error ? error.message : 'Tuntematon virhe';
    res.status(status).json({ error: message });
  });
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const store = new WorkspaceStore(process.env.CONTRACT_EPHEMERAL === '1' ? undefined : resolve(process.env.CONTRACT_DATA_FILE || '.contract-data/workspace.json'));
  const port = Number(process.env.PORT || 4317);
  createApp(store).listen(port, '127.0.0.1', () => console.log(`Sopimuskartta: http://127.0.0.1:${port}`));
}
