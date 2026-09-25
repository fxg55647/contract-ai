import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  applyPatch,
  difference,
  emptyModel,
  ModelError,
  modelSchema,
  patchSchema,
  validateModel,
  type ContractModel,
  type Message,
  type Workspace,
} from "../shared/model";
import {
  createLiveSourceDocument,
  createSourceDocument,
  sourceDocumentSchema,
  sourceFingerprint,
  uniqueSourceReferences,
  type LiveSourceExcerptInput,
  type SourceDocument,
} from "../shared/sources";
import { draftSchema, embeddedDocumentSchema, mapIdSchema, storedMapSchema, type StoredMap } from "../shared/document";
import { newDocumentId, readDocx, writeDocx, type ReadDocx } from "./docx";

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});
const changeSchema = z.object({
  revision: z.number(),
  summary: z.string(),
  actor: z.string(),
  added: z.array(z.string()),
  updated: z.array(z.string()),
  removed: z.array(z.string()),
});
const savedSchema = z.object({
  model: modelSchema,
  maps: z.array(storedMapSchema).min(1).max(100),
  activeMapId: mapIdSchema,
  nextMapNumber: z.number().int().positive().max(999999),
  messages: z.array(messageSchema),
  sourceDocuments: z.array(sourceDocumentSchema).max(100),
  nextDocumentNumber: z.number().int().positive().max(999999),
  selection: z.string().nullable(),
  draft: draftSchema,
  lastChange: changeSchema.nullable(),
  history: z.array(changeSchema),
  undo: z.array(modelSchema),
  redo: z.array(modelSchema),
  document: z.object({
    id: z.string().uuid(),
    fileName: z.string().min(1).max(200),
    packageBase64: z.string().nullable(),
    textFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    textChanged: z.boolean(),
    dirty: z.boolean(),
  }).strict(),
}).strict();
type Saved = z.infer<typeof savedSchema>;
export class WorkspaceStore {
  private data: Saved;
  private listeners = new Set<() => void>();
  constructor(private file?: string) {
    const initialModel = emptyModel();
    this.data = {
      model: initialModel,
      maps: [{ id: "M1", model: initialModel, draft: null }],
      activeMapId: "M1",
      nextMapNumber: 2,
      messages: [],
      sourceDocuments: [],
      nextDocumentNumber: 1,
      selection: null,
      draft: null,
      lastChange: null,
      history: [],
      undo: [],
      redo: [],
      document: {
        id: newDocumentId(),
        fileName: "semantic-logic-map.docx",
        packageBase64: null,
        textFingerprint: null,
        textChanged: false,
        dirty: true,
      },
    };
    if (file) {
      try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        // Pre-DOCX workspaces have no document metadata. Only migrate an
        // absent field; malformed existing metadata must still be rejected.
        if (raw && typeof raw === "object" && !Array.isArray(raw) &&
            !Object.hasOwn(raw, "document")) {
          raw.document = this.data.document;
        }
        // One-map workspaces are migrated into the map catalog on first read.
        if (raw && typeof raw === "object" && !Array.isArray(raw) &&
            !Object.hasOwn(raw, "maps")) {
          raw.maps = [{ id: "M1", model: raw.model, draft: raw.draft ?? null }];
          raw.activeMapId = "M1";
          raw.nextMapNumber = 2;
        }
        const saved = savedSchema.parse(raw);
        this.data = {
          ...saved,
          model: this.uniqueNodeSourceReferences(saved.model),
          maps: saved.maps.map(map => ({
            ...map,
            model: this.uniqueNodeSourceReferences(map.model),
          })),
          undo: saved.undo.map((model) => this.uniqueNodeSourceReferences(model)),
          redo: saved.redo.map((model) => this.uniqueNodeSourceReferences(model)),
        };
        validateModel(this.data.model);
        this.assertSourceReferences(this.data.model);
        this.assertMaps(this.data.maps, this.data.activeMapId);
        this.data.undo.forEach(validateModel);
        this.data.redo.forEach(validateModel);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          throw new Error(
            `The saved workspace could not be read and will not be overwritten: ${file}`,
            { cause: error },
          );
      }
    }
  }
  snapshot(aiConfigured = false): Workspace {
    const {
      undo,
      redo,
      maps,
      nextMapNumber: _nextMapNumber,
      nextDocumentNumber: _nextDocumentNumber,
      document,
      ...data
    } = structuredClone(this.data);
    return {
      ...data,
      maps: maps.map(map => ({
        id: map.id,
        title: map.model.title,
        nodeCount: map.model.nodes.length,
        revision: map.model.revision,
      })),
      canUndo: undo.length > 0,
      canRedo: redo.length > 0,
      aiConfigured,
      document: {
        id: document.id,
        fileName: document.fileName,
        dirty: document.dirty,
        textChanged: document.textChanged,
      },
    };
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private save(next: Saved) {
    const synced: Saved = {
      ...next,
      maps: next.maps.map(map => map.id === next.activeMapId
        ? { ...map, model: next.model, draft: next.draft }
        : map),
    };
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      writeFileSync(temporary, JSON.stringify(synced, null, 2), { mode: 0o600 });
      renameSync(temporary, this.file);
    }
    this.data = synced;
    this.listeners.forEach((listener) => listener());
  }
  private assertRevision(revision: number) {
    if (revision !== this.data.model.revision)
      throw new ModelError(
        "The map changed. Read the latest version before editing.",
        409,
      );
  }
  apply(input: unknown, actor: string) {
    const patch = patchSchema.parse(input);
    const model = this.uniqueNodeSourceReferences(applyPatch(this.data.model, patch));
    this.assertSourceReferences(model);
    this.commit(
      model,
      patch.summary,
      actor,
      [...this.data.undo, this.data.model].slice(-50),
      [],
    );
    return this.snapshot();
  }
  private assertSourceReferences(model: ContractModel, sources = this.data.sourceDocuments) {
    const documents = new Map(sources.map((document) => [document.id, document]));
    for (const node of model.nodes) {
      for (const reference of node.sourceRefs) {
        const document = documents.get(reference.documentId);
        if (!document || !document.fragments.some((fragment) => fragment.id === reference.fragmentId))
          throw new ModelError(`${node.id} refers to missing source excerpt ${reference.fragmentId}.`);
        const fragment = document.fragments.find(fragment => fragment.id === reference.fragmentId)!;
        if (reference.quote && !fragment.text.includes(reference.quote))
          throw new ModelError(`${node.id}: the quote must be an exact substring of the source excerpt.`);
      }
    }
  }
  private assertMaps(maps: StoredMap[], activeMapId: string, sources = this.data.sourceDocuments) {
    const ids = new Set<string>();
    for (const map of maps) {
      if (ids.has(map.id)) throw new ModelError("Map identifiers must be unique.");
      ids.add(map.id);
      validateModel(map.model);
      this.assertSourceReferences(map.model, sources);
    }
    if (!ids.has(activeMapId)) throw new ModelError("The active map was not found.");
  }
  private uniqueNodeSourceReferences(model: ContractModel): ContractModel {
    return {
      ...model,
      nodes: model.nodes.map((node) => ({
        ...node,
        sourceRefs: uniqueSourceReferences(node.sourceRefs),
      })),
    };
  }
  private commit(
    model: ContractModel,
    summary: string,
    actor: string,
    undo: ContractModel[],
    redo: ContractModel[],
  ) {
    const change = difference(this.data.model, model, summary, actor);
    this.save({
      ...this.data,
      model,
      undo,
      redo,
      lastChange: change,
      history: [...this.data.history, change].slice(-100),
      selection: model.nodes.some((n) => n.id === this.data.selection)
        ? this.data.selection
        : null,
      document: { ...this.data.document, dirty: true },
    });
  }
  replaceModel(input: unknown, revision: number, actor: string) {
    this.assertRevision(revision);
    const incoming = this.uniqueNodeSourceReferences(validateModel(input));
    this.assertSourceReferences(incoming);
    const model = {
      ...incoming,
      revision: revision + 1,
      nextNodeNumber: Math.max(
        incoming.nextNodeNumber,
        this.data.model.nextNodeNumber,
      ),
    };
    this.commit(
      model,
      "Semantic map replaced",
      actor,
      [...this.data.undo, this.data.model].slice(-50),
      [],
    );
    return this.snapshot();
  }
  undo(revision: number, redo = false) {
    this.assertRevision(revision);
    const source = redo ? this.data.redo : this.data.undo;
    if (!source.length)
      throw new ModelError(
        redo ? "There is no change to redo." : "There is no change to undo.",
      );
    const previous = source.at(-1)!;
    const model = {
      ...previous,
      revision: revision + 1,
      nextNodeNumber: Math.max(
        previous.nextNodeNumber,
        this.data.model.nextNodeNumber,
      ),
    };
    this.commit(
      model,
      redo ? "Change redone" : "Latest change undone",
      "editor",
      redo
        ? [...this.data.undo, this.data.model].slice(-50)
        : this.data.undo.slice(0, -1),
      redo
        ? this.data.redo.slice(0, -1)
        : [...this.data.redo, this.data.model].slice(-50),
    );
    return this.snapshot();
  }
  select(id: string | null) {
    if (id && !this.data.model.nodes.some((n) => n.id === id))
      throw new ModelError("The selected node does not exist.");
    this.save({ ...this.data, selection: id });
    return this.snapshot();
  }
  createMap(title: string | undefined, revision: number) {
    this.assertRevision(revision);
    if (this.data.maps.length >= 100) throw new ModelError("A map file can contain at most 100 maps.");
    const id = `M${this.data.nextMapNumber}`;
    const parsedTitle = title
      ? z.string().trim().min(1).max(160).parse(title)
      : `New map ${this.data.nextMapNumber}`;
    const model = { ...emptyModel(), title: parsedTitle, revision: revision + 1 };
    this.save({
      ...this.data,
      maps: [...this.data.maps, { id, model, draft: null }],
      activeMapId: id,
      nextMapNumber: this.data.nextMapNumber + 1,
      model,
      draft: null,
      selection: null,
      lastChange: null,
      history: [],
      undo: [],
      redo: [],
      document: { ...this.data.document, dirty: true },
    });
    return this.snapshot();
  }
  activateMap(id: string, revision: number) {
    this.assertRevision(revision);
    if (id === this.data.activeMapId) return this.snapshot();
    const target = this.data.maps.find(map => map.id === id);
    if (!target) throw new ModelError("Map not found.", 404);
    const model = { ...structuredClone(target.model), revision: revision + 1 };
    const draft = target.draft
      ? { ...structuredClone(target.draft), revision: target.draft.revision === target.model.revision ? model.revision : target.draft.revision }
      : null;
    this.save({
      ...this.data,
      activeMapId: id,
      model,
      draft,
      selection: null,
      lastChange: null,
      history: [],
      undo: [],
      redo: [],
      document: { ...this.data.document, dirty: true },
    });
    return this.snapshot();
  }
  deleteMap(id: string, revision: number) {
    this.assertRevision(revision);
    if (!this.data.maps.some(map => map.id === id)) throw new ModelError("Map not found.", 404);
    let maps = this.data.maps.filter(map => map.id !== id);
    let nextMapNumber = this.data.nextMapNumber;
    if (!maps.length) {
      const replacementId = `M${nextMapNumber}`;
      nextMapNumber += 1;
      maps = [{ id: replacementId, model: emptyModel(), draft: null }];
    }
    const activeMapId = id === this.data.activeMapId ? maps[0].id : this.data.activeMapId;
    const target = maps.find(map => map.id === activeMapId)!;
    const model = {
      ...structuredClone(id === this.data.activeMapId ? target.model : this.data.model),
      revision: revision + 1,
    };
    const sourceDraft = id === this.data.activeMapId ? target.draft : this.data.draft;
    const sourceRevision = id === this.data.activeMapId ? target.model.revision : this.data.model.revision;
    const draft = sourceDraft
      ? { ...structuredClone(sourceDraft), revision: sourceDraft.revision === sourceRevision ? model.revision : sourceDraft.revision }
      : null;
    this.save({
      ...this.data,
      maps,
      activeMapId,
      nextMapNumber,
      model,
      draft,
      selection: null,
      lastChange: null,
      history: [],
      undo: [],
      redo: [],
      document: { ...this.data.document, dirty: true },
    });
    return this.snapshot();
  }
  message(role: Message["role"], content: string) {
    const message: Message = {
      id: randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    this.save({ ...this.data, messages: [...this.data.messages, message] });
    return message;
  }
  addSourceDocument(content: string, messageId: string, title?: string): SourceDocument {
    const document = createSourceDocument(content, this.data.nextDocumentNumber, messageId);
    if (title) document.title = z.string().trim().min(1).max(200).parse(title);
    const existing = this.data.sourceDocuments.find(
      (candidate) => candidate.fingerprint === document.fingerprint && candidate.content === document.content,
    );
    if (existing) return structuredClone(existing);
    if (this.data.sourceDocuments.length >= 100) throw new ModelError('A workspace can contain at most 100 source excerpt sets.');
    this.save({
      ...this.data,
      sourceDocuments: [...this.data.sourceDocuments, document],
      nextDocumentNumber: this.data.nextDocumentNumber + 1,
      document: { ...this.data.document, dirty: true },
    });
    return structuredClone(document);
  }
  addLiveSourceDocument(input: {
    title: string;
    application: "libreoffice-writer" | "microsoft-word";
    externalDocumentId: string;
    excerpts: LiveSourceExcerptInput[];
  }): SourceDocument {
    const document = createLiveSourceDocument(input, this.data.nextDocumentNumber);
    const existing = this.data.sourceDocuments.find(
      (candidate) => candidate.origin?.kind === "live-document" &&
        candidate.origin.application === document.origin?.application &&
        candidate.origin.externalDocumentId === document.origin.externalDocumentId &&
        candidate.content === document.content,
    );
    if (existing) return structuredClone(existing);
    if (this.data.sourceDocuments.length >= 100) throw new ModelError('A workspace can contain at most 100 source excerpt sets.');
    this.save({
      ...this.data,
      sourceDocuments: [...this.data.sourceDocuments, document],
      nextDocumentNumber: this.data.nextDocumentNumber + 1,
      document: { ...this.data.document, dirty: true },
    });
    return structuredClone(document);
  }
  private assertDocumentSources(maps: StoredMap[], activeMapId: string, sourceDocuments: SourceDocument[]) {
    this.assertMaps(maps, activeMapId, sourceDocuments);
    const sourceIds = new Set<string>();
    for (const document of sourceDocuments) {
      if (sourceIds.has(document.id)) throw new ModelError('Source document identifiers must be unique.');
      sourceIds.add(document.id);
      if (sourceFingerprint(document.content) !== document.fingerprint) throw new ModelError('The source text checksum does not match.');
      const fragments = new Set<string>();
      for (const fragment of document.fragments) {
        if (!fragment.id.startsWith(document.id + '-F') || fragments.has(fragment.id) || document.content.slice(fragment.start, fragment.end) !== fragment.text)
          throw new ModelError('A source excerpt does not match its stored text.');
        fragments.add(fragment.id);
      }
    }
  }
  openDocument(document: ReadDocx, revision: number) {
    this.assertRevision(revision);
    const embedded = document.embedded ? embeddedDocumentSchema.parse(document.embedded) : null;
    const sourceDocuments = structuredClone(embedded?.sourceDocuments ?? []);
    const maps: StoredMap[] = embedded?.formatVersion === 2
      ? structuredClone(embedded.maps)
      : [{
          id: "M1",
          model: structuredClone(embedded?.model ?? emptyModel()),
          draft: structuredClone(embedded?.draft ?? null),
        }];
    const activeMapId = embedded?.formatVersion === 2 ? embedded.activeMapId : "M1";
    const normalizedMaps = maps.map(map => ({ ...map, model: this.uniqueNodeSourceReferences(map.model) }));
    this.assertDocumentSources(normalizedMaps, activeMapId, sourceDocuments);
    const activeMap = normalizedMaps.find(map => map.id === activeMapId)!;
    const incoming = activeMap.model;
    const model = { ...incoming, revision: revision + 1 };
    const nextDocumentNumber = Math.max(1, ...sourceDocuments.map((source) => Number(source.id.slice(1)) + 1));
    const draft = activeMap.draft
      ? { ...activeMap.draft, revision: activeMap.draft.revision === activeMap.model.revision ? model.revision : activeMap.draft.revision }
      : null;
    const openedMaps = normalizedMaps.map(map => map.id === activeMapId ? { ...map, model, draft } : map);
    const nextMapNumber = Math.max(1, ...openedMaps.map(map => Number(map.id.slice(1)) + 1));
    this.save({
      model,
      maps: openedMaps,
      activeMapId,
      nextMapNumber,
      messages: [],
      sourceDocuments,
      nextDocumentNumber,
      selection: null,
      draft,
      lastChange: null,
      history: [],
      undo: [],
      redo: [],
      document: {
        id: embedded?.documentId ?? newDocumentId(),
        fileName: document.fileName,
        packageBase64: document.packageBase64,
        textFingerprint: document.textFingerprint,
        textChanged: document.textChanged,
        dirty: false,
      },
    });
    return this.snapshot();
  }
  async openDocumentBuffer(buffer: Buffer, fileName: string, revision: number) {
    return this.openDocument(await readDocx(buffer, fileName), revision);
  }
  async saveDocument() {
    const source = this.data;
    const fileName = source.document.fileName;
    const buffer = await writeDocx(source.document.packageBase64, {
      format: "sopimuskartta-docx",
      formatVersion: 2,
      documentId: source.document.id,
      maps: structuredClone(source.maps),
      activeMapId: source.activeMapId,
      sourceDocuments: structuredClone(source.sourceDocuments),
    });
    const reread = await readDocx(buffer, fileName);
    if (this.data.document.id === source.document.id) {
      const contentUnchanged =
        this.data.model === source.model &&
        this.data.maps === source.maps &&
        this.data.sourceDocuments === source.sourceDocuments &&
        this.data.draft === source.draft;
      this.save({
        ...this.data,
        document: {
          ...this.data.document,
          packageBase64: buffer.toString("base64"),
          textFingerprint: reread.textFingerprint,
          textChanged: false,
          dirty: contentUnchanged ? false : this.data.document.dirty,
        },
      });
    }
    return { buffer, fileName };
  }
  setDraft(text: string, revision: number) {
    this.assertRevision(revision);
    this.save({ ...this.data, draft: { text, revision }, document: { ...this.data.document, dirty: true } });
  }
}
