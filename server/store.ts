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
import { createSourceDocument, sourceDocumentSchema, uniqueSourceReferences, type SourceDocument } from "../shared/sources";
import { embeddedDocumentSchema } from "../shared/document";
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
  messages: z.array(messageSchema),
  sourceDocuments: z.array(sourceDocumentSchema).max(100),
  nextDocumentNumber: z.number().int().positive().max(999999),
  selection: z.string().nullable(),
  draft: z.object({ text: z.string(), revision: z.number() }).nullable(),
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
    this.data = {
      model: emptyModel(),
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
        fileName: "sopimus.docx",
        packageBase64: null,
        textFingerprint: null,
        textChanged: false,
        dirty: true,
      },
    };
    if (file) {
      try {
        const saved = savedSchema.parse(JSON.parse(readFileSync(file, "utf8")));
        this.data = {
          ...saved,
          model: this.uniqueNodeSourceReferences(saved.model),
          undo: saved.undo.map((model) => this.uniqueNodeSourceReferences(model)),
          redo: saved.redo.map((model) => this.uniqueNodeSourceReferences(model)),
        };
        validateModel(this.data.model);
        this.assertSourceReferences(this.data.model);
        this.data.undo.forEach(validateModel);
        this.data.redo.forEach(validateModel);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          throw new Error(
            `Tallennettua työtilaa ei voitu lukea. Tiedostoa ei ylikirjoiteta: ${file}`,
            { cause: error },
          );
      }
    }
  }
  snapshot(aiConfigured = false): Workspace {
    const { undo, redo, nextDocumentNumber: _nextDocumentNumber, document, ...data } = structuredClone(this.data);
    return {
      ...data,
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
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
      renameSync(temporary, this.file);
    }
    this.data = next;
    this.listeners.forEach((listener) => listener());
  }
  private assertRevision(revision: number) {
    if (revision !== this.data.model.revision)
      throw new ModelError(
        "Rakenne muuttui. Lue uusin versio ennen muutosta.",
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
          throw new ModelError(`${node.id} viittaa puuttuvaan lähdekatkelmaan ${reference.fragmentId}.`);
        const fragment = document.fragments.find(fragment => fragment.id === reference.fragmentId)!;
        if (reference.quote && !fragment.text.includes(reference.quote))
          throw new ModelError(`${node.id}: lainauksen on oltava sanatarkka osa lähdekatkelmaa.`);
      }
    }
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
      "Sopimusrakenne vaihdettu",
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
        redo ? "Ei palautettavaa muutosta." : "Ei kumottavaa muutosta.",
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
      redo ? "Muutos palautettu" : "Viimeisin muutos kumottu",
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
      throw new ModelError("Valittua nodea ei ole olemassa.");
    this.save({ ...this.data, selection: id });
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
    if (this.data.sourceDocuments.length >= 100) throw new ModelError('Työtilassa voi olla enintään 100 lähdedokumenttia.');
    this.save({
      ...this.data,
      sourceDocuments: [...this.data.sourceDocuments, document],
      nextDocumentNumber: this.data.nextDocumentNumber + 1,
      document: { ...this.data.document, dirty: true },
    });
    return structuredClone(document);
  }
  private assertDocumentSources(model: ContractModel, sourceDocuments: SourceDocument[]) {
    validateModel(model);
    this.assertSourceReferences(model, sourceDocuments);
    const sourceIds = new Set<string>();
    for (const document of sourceDocuments) {
      if (sourceIds.has(document.id)) throw new ModelError('Lähdedokumentin tunniste toistuu.');
      sourceIds.add(document.id);
      const canonical = createSourceDocument(document.content, Number(document.id.slice(1)), document.messageId, document.createdAt);
      if (canonical.fingerprint !== document.fingerprint) throw new ModelError('Lähdetekstin tarkistussumma ei täsmää.');
      const fragments = new Set<string>();
      for (const fragment of document.fragments) {
        if (!fragment.id.startsWith(document.id + '-F') || fragments.has(fragment.id) || document.content.slice(fragment.start, fragment.end) !== fragment.text)
          throw new ModelError('Lähdekatkelma ei vastaa alkuperäistä tekstiä.');
        fragments.add(fragment.id);
      }
    }
  }
  openDocument(document: ReadDocx, revision: number) {
    this.assertRevision(revision);
    const embedded = document.embedded ? embeddedDocumentSchema.parse(document.embedded) : null;
    const sourceDocuments = structuredClone(embedded?.sourceDocuments ?? []);
    const incoming = this.uniqueNodeSourceReferences(embedded?.model ?? emptyModel());
    this.assertDocumentSources(incoming, sourceDocuments);
    const model = { ...incoming, revision: revision + 1 };
    const nextDocumentNumber = Math.max(1, ...sourceDocuments.map((source) => Number(source.id.slice(1)) + 1));
    const draft = embedded?.draft
      ? { ...embedded.draft, revision: embedded.draft.revision === embedded.model.revision ? model.revision : embedded.draft.revision }
      : null;
    this.save({
      model,
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
      formatVersion: 1,
      documentId: source.document.id,
      model: structuredClone(source.model),
      sourceDocuments: structuredClone(source.sourceDocuments),
      draft: structuredClone(source.draft),
    });
    const reread = await readDocx(buffer, fileName);
    if (this.data.document.id === source.document.id) {
      const contentUnchanged =
        this.data.model === source.model &&
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
