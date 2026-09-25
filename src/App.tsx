import { useEffect, useRef, useState, type ReactNode } from "react";
import { ContractCanvas } from "./components/ContractCanvas";
import { Inspector } from "./components/Inspector";
import { post } from "./api";
import {
  modelWarnings,
  type Operation,
  type Workspace,
  type ContractModel,
} from "../shared/model";
import { exampleModel } from "../shared/example";

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type ActionIconName = "draft" | "open" | "save" | "maps" | "mcp" | "present" | "help";
function ActionIcon({ name }: { name: ActionIconName }) {
  const paths: Record<ActionIconName, ReactNode> = {
    draft: <><path d="M5 3h7l4 4v14H5z"/><path d="M12 3v5h5M8 12h6M8 16h6"/></>,
    open: <><path d="M3 7h7l2 2h9l-2 10H4z"/><path d="M5 7V4h6l2 3"/></>,
    save: <><path d="M4 3h14l2 2v16H4z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
    maps: <><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    mcp: <><path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-6 6v4"/><path d="M9 21h6"/></>,
    present: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9l3 3 6-5"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/></>,
  };
  return <svg className="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export default function App() {
  const [state, setState] = useState<Workspace | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [writing, setWriting] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [newMapTitle, setNewMapTitle] = useState("");
  const [panel, setPanel] = useState<
    "issues" | "draft" | "history" | "mcp" | "help" | "maps" | null
  >(null);
  const [edgeEdit, setEdgeEdit] = useState<{
    id: string;
    label: string;
    revision: number;
  } | null>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.onmessage = (event) => {
      setState(JSON.parse(event.data));
      setConnected(true);
    };
    events.onerror = () => setConnected(false);
    return () => events.close();
  }, []);
  async function action(endpoint: string, body: unknown) {
    setError("");
    try {
      await post(endpoint, body);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }
  async function change(
    operations: Operation[],
    summary: string,
    revision = state?.model.revision,
  ) {
    if (!state || writing || !connected) return false;
    setWriting(true);
    try {
      return await action("changes", {
        operations,
        summary,
        expectedRevision: revision,
      });
    } finally {
      setWriting(false);
    }
  }
  async function select(id: string | null) {
    setEdgeEdit(null);
    setPanel(null);
    await action("selection", { id });
  }
  if (!state)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          s<span>·</span>
        </div>
        <h1>Semantic Logic Mapper</h1>
        <p>
          {connected
            ? "Opening the shared workspace…"
            : "Connecting to the local workspace…"}
        </p>
        <p className="muted">Start the application with npm run dev.</p>
      </div>
    );
  const model = state.model;
  const selected = model.nodes.find((n) => n.id === state.selection);
  const warnings = modelWarnings(model);
  const openNodes = model.nodes.filter(
    (n) => n.open,
  );
  const changed = [
    ...(state.lastChange?.added ?? []),
    ...(state.lastChange?.updated ?? []),
  ];
  async function loadExample() {
    if (await action("model", { model: exampleModel(), expectedRevision: model.revision }))
      setFitToken((value) => value + 1);
  }
  async function openDocument(file: File) {
    setError("");
    setWriting(true);
    try {
      const response = await fetch(`/api/document/open?expectedRevision=${model.revision}`, {
        method: "POST",
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "x-document-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `Request failed (${response.status})`);
      }
      setFitToken((value) => value + 1);
      setPanel(null);
      setEdgeEdit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(false);
    }
  }
  async function saveDocument() {
    setError("");
    setWriting(true);
    try {
      const response = await fetch("/api/document/save", { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `Request failed (${response.status})`);
      }
      downloadBlob(state?.document.fileName ?? "semantic-logic-map.docx", await response.blob());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(false);
    }
  }
  function showPanel(next: typeof panel) {
    setPanel(panel === next ? null : next);
    setEdgeEdit(null);
  }
  const editable = connected && !writing && !presenting;
  return (
    <div className={`app ${presenting ? "presenting" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            s<span>·</span>
          </div>
          <div>
            <strong>Semantic Logic Mapper</strong>
            <span>Turn complex logic into a shared view.</span>
          </div>
        </div>
        <div className="workspace-status">
          <span className={`connection-dot ${connected ? "online" : ""}`} />
          {connected
            ? `${state.document.fileName}${state.document.dirty ? " · unsaved changes" : " · saved"}`
            : "Connection lost — reconnecting"}
          <span className="version">v{model.revision}</span>
        </div>
        <div className="top-actions">
          {!presenting && (
            <>
                <button onClick={() => showPanel("draft")}>
                  <ActionIcon name="draft" /> Draft
                </button>
                <button
                  disabled={!editable}
                  onClick={() => documentInput.current?.click()}
                >
                  <ActionIcon name="open" /> Open map file
                </button>
                <button disabled={!editable} onClick={() => void saveDocument()}>
                  <ActionIcon name="save" /> Save map file
                </button>
                <input
                  ref={documentInput}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only"
                  aria-label="Open Semantic Logic Mapper DOCX file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await openDocument(file);
                    e.target.value = "";
                  }}
                />
            </>
          )}
          <button onClick={() => showPanel("maps")}><ActionIcon name="maps" /> Maps ({state.maps.length})</button>
          <button onClick={() => showPanel("mcp")}><ActionIcon name="mcp" /> MCP connection</button>
          <button
            className={presenting ? "primary" : ""}
            onClick={() => {
              setPresenting((v) => !v);
              setFitToken((v) => v + 1);
            }}
          >
            <ActionIcon name="present" /> {presenting ? "Exit presentation" : "Presentation"}
          </button>
          <button onClick={() => showPanel("help")}><ActionIcon name="help" /> Help</button>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="Sulje virheilmoitus" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {state.document.textChanged && (
        <div className="notice document-notice" role="status">
          The document text has changed in Word or LibreOffice. Review the map and its source references.
        </div>
      )}
      <div className="workspace">
        <main className="canvas-panel">
          <div className="graph-area">
            <ContractCanvas
              key={`${state.document.id}:${state.activeMapId}`}
              sourceDocuments={state.sourceDocuments}
              model={model}
              selected={state.selection}
              changed={changed}
              compact={false}
              readOnly={!editable}
              path={[]}
              fitToken={fitToken}
              onSelect={(id) => void select(id)}
              onEdge={(id) => {
                if (presenting) return;
                const edge = model.edges.find((e) => e.id === id)!;
                setEdgeEdit({
                  id,
                  label: edge.label,
                  revision: model.revision,
                });
                setPanel(null);
              }}
              onChange={change}
            />
            {!model.nodes.length && (
              <div className="empty-canvas">
                <div className="empty-illustration">
                  <span>Situation</span>
                  <i>↓</i>
                  <span className="decision-example">What happens?</span>
                  <i>↙　↘</i>
                  <div>
                    <span>Option A</span>
                    <span>Option B</span>
                  </div>
                </div>
                <h2>
                  A shared view of
                  <br />
                  how the logic works.
                </h2>
                <p>
                  Discuss it first. Then build a map
                  <br />
                  that makes conditions and consequences visible.
                </p>
                <div className="button-row">
                  <button
                    disabled={!editable}
                    className="primary"
                    onClick={() => void loadExample()}
                  >
                    Explore an example
                  </button>
                </div>
              </div>
            )}

          </div>
        </main>
        {selected && !panel && !edgeEdit && (
          <Inspector
            key={selected.id}
            node={selected}
            model={model}
            sourceDocuments={state.sourceDocuments}
            readOnly={!editable}
            onClose={() => void select(null)}
            onChange={change}
          />
        )}
        {edgeEdit && (
          <aside className="inspector">
            <div className="panel-heading">
              <h2>Connection condition</h2>
              <button className="icon-button" onClick={() => setEdgeEdit(null)}>
                ×
              </button>
            </div>
            <div className="inspector-body">
              <p>
                {model.edges.find((e) => e.id === edgeEdit.id)?.source} →{" "}
                {model.edges.find((e) => e.id === edgeEdit.id)?.target}
              </p>
              <label>
                When is this path followed?
                <input
                  value={edgeEdit.label}
                  onChange={(e) =>
                    setEdgeEdit({ ...edgeEdit, label: e.target.value })
                  }
                  maxLength={160}
                />
              </label>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={!editable}
                  onClick={async () => {
                    if (
                      await change(
                        [
                          {
                            type: "update_edge",
                            id: edgeEdit.id,
                            label: edgeEdit.label,
                          },
                        ],
                        "Connection condition updated",
                        edgeEdit.revision,
                      )
                    )
                      setEdgeEdit(null);
                  }}
                >
                  Save condition
                </button>
                <button
                  disabled={!editable}
                  onClick={async () => {
                    if (
                      await change(
                        [{ type: "delete_edge", id: edgeEdit.id }],
                        "Connection deleted",
                        edgeEdit.revision,
                      )
                    )
                      setEdgeEdit(null);
                  }}
                >
                  Delete connection
                </button>
              </div>
            </div>
          </aside>
        )}
        {panel && (
          <aside className="inspector auxiliary-panel">
            <div className="panel-heading">
              <h2>
                {
                  {
                    issues: "Open questions",
                    draft: "Text draft",
                    history: "Change history",
                    mcp: "MCP connection",
                    help: "Help",
                    maps: "Maps in this file",
                  }[panel]
                }
              </h2>
              <button
                className="icon-button"
                aria-label="Close side panel"
                onClick={() => setPanel(null)}
              >
                ×
              </button>
            </div>
            <div className="inspector-body">
              {panel === "issues" && (
                <>
                  {openNodes.length === 0 && (
                    <p>No open questions have been recorded.</p>
                  )}
                  {openNodes.map((n) => (
                    <button
                      className="issue-card"
                      key={n.id}
                      onClick={() => void select(n.id)}
                    >
                      <span>
                        {n.id} · {n.title}
                      </span>
                      <p>{n.text || "This step needs clarification."}</p>
                    </button>
                  ))}
                  <h3>Structure check</h3>
                  {warnings.length ? (
                    warnings.map((w, i) => (
                      <button
                        className="issue-card structural"
                        key={i}
                        onClick={() => void select(w.nodeId)}
                      >
                        {w.nodeId} · {w.text}
                      </button>
                    ))
                  ) : (
                    <p className="muted">
                      No structural issues were detected. This does not verify
                      the correctness of the underlying content.
                    </p>
                  )}
                </>
              )}
              {panel === "history" && (
                <>
                  {!state.history.length && <p>No changes yet.</p>}
                  {[...state.history].reverse().map((c) => (
                    <article className="history-item" key={c.revision}>
                      <span className="eyebrow">
                        VERSION {c.revision} ·{" "}
                        {c.actor === "editor" ? "MANUAL" : c.actor.toUpperCase()}
                      </span>
                      <h3>{c.summary}</h3>
                      <p>
                        {c.added.length > 0 &&
                          `Added: ${c.added.join(", ")}. `}
                        {c.updated.length > 0 &&
                          `Updated: ${c.updated.join(", ")}. `}
                        {c.removed.length > 0 &&
                          `Removed: ${c.removed.join(", ")}.`}
                      </p>
                    </article>
                  ))}
                </>
              )}
              {panel === "draft" && (
                <>
                  <p>
                    The draft is generated from the active map. Unresolved
                    points remain visible.
                  </p>
                  <p className="prompt-example">
                    Ask ChatGPT: “Create a text draft from the active map and save it to the workspace. Mark unresolved conditions.”
                  </p>
                  {state.draft && (
                    <>
                      {state.draft.revision !== model.revision && (
                        <div className="notice">
                          The map has changed. This text is based on version{" "}
                          {state.draft.revision}.
                        </div>
                      )}
                      <div className="draft-text">{state.draft.text}</div>
                      <button
                        onClick={() =>
                          downloadBlob("logic-map-draft.txt", new Blob([state.draft!.text], { type: "text/plain;charset=utf-8" }))
                        }
                      >
                        Download text
                      </button>
                    </>
                  )}
                </>
              )}
              {panel === "maps" && (
                <>
                  <p>
                    This file contains {state.maps.length} {state.maps.length === 1 ? "map" : "maps"}.
                    Only one map is active at a time.
                  </p>
                  <div className="map-list">
                    {state.maps.map(map => (
                      <article className={`map-card ${map.id === state.activeMapId ? "active" : ""}`} key={map.id}>
                        <div>
                          <span className="eyebrow">{map.id}{map.id === state.activeMapId ? " · ACTIVE" : ""}</span>
                          <h3>{map.title}</h3>
                          <p>{map.nodeCount} {map.nodeCount === 1 ? "box" : "boxes"}</p>
                        </div>
                        <div className="map-actions">
                          {map.id !== state.activeMapId && (
                            <button
                              disabled={!editable}
                              onClick={async () => {
                                if (await action("maps/select", { id: map.id, expectedRevision: model.revision })) {
                                  setPanel(null);
                                  setFitToken(value => value + 1);
                                }
                              }}
                            >
                              Open
                            </button>
                          )}
                          <button
                            className="danger-button"
                            disabled={!editable}
                            onClick={async () => {
                              if (!window.confirm(`Delete the map “${map.title}”? This cannot be undone.`)) return;
                              if (await action("maps/delete", { id: map.id, expectedRevision: model.revision }))
                                setFitToken(value => value + 1);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <h3>New map</h3>
                  <label>
                    Name
                    <input
                      value={newMapTitle}
                      maxLength={160}
                      placeholder="For example, Incident handling"
                      onChange={event => setNewMapTitle(event.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={!editable || !newMapTitle.trim()}
                    onClick={async () => {
                      if (await action("maps", { title: newMapTitle.trim(), expectedRevision: model.revision })) {
                        setNewMapTitle("");
                        setPanel(null);
                        setFitToken(value => value + 1);
                      }
                    }}
                  >
                    Create and open
                  </button>
                  <p className="muted">
                    Deleting a map does not delete the original Word/Writer document.
                    If you delete the final map, an empty replacement is created.
                  </p>
                </>
              )}
              {panel === "help" && (
                <>
                  <h3>Top bar buttons</h3>
                  <dl className="help-button-list">
                    <dt><ActionIcon name="draft" /> Draft</dt>
                    <dd>Shows the text draft generated from the active map and lets you download it.</dd>
                    <dt><ActionIcon name="open" /> Open map file</dt>
                    <dd>Opens a DOCX file previously saved by Semantic Logic Mapper. It does not open the source document for analysis.</dd>
                    <dt><ActionIcon name="save" /> Save map file</dt>
                    <dd>Downloads a DOCX containing all maps, layouts, cited excerpts and drafts in an editable form.</dd>
                    <dt><ActionIcon name="maps" /> Maps</dt>
                    <dd>Lists every map in the current file. Open, create or delete maps individually.</dd>
                    <dt><ActionIcon name="mcp" /> MCP connection</dt>
                    <dd>Shows how an AI client connects to and edits the same local workspace.</dd>
                    <dt><ActionIcon name="present" /> Presentation</dt>
                    <dd>Hides editing controls for a clean view suitable for screen sharing.</dd>
                    <dt><ActionIcon name="help" /> Help</dt>
                    <dd>Opens this guide.</dd>
                  </dl>
                  <h3>Working with the map</h3>
                  <p>
                    Select any box to open its details in the panel on the right.
                    When editing is enabled, the title, content, open status and
                    source references can be changed there. Select a connection
                    label to edit or delete that connection.
                  </p>
                  <h3>Visualizing a source document</h3>
                  <ol className="instructions">
                    <li>First open the original file in Microsoft Word or LibreOffice Writer.</li>
                    <li>Ask ChatGPT to read the open document and visualize the relevant process or logic.</li>
                    <li>Keep the document open for verification. Semantic Logic Mapper stores only the exact excerpts cited by the map and their locators, not the complete source file.</li>
                  </ol>
                  <div className="prompt-example">
                    “Read the document open in Writer and visualize its incident-handling logic. Preserve exact source references.”
                  </div>
                  <h3>Multiple maps in one file</h3>
                  <p>
                    The <strong>Maps</strong> panel lists every visualization in
                    the map file. Maps can be opened, created and deleted
                    individually. Deleting one does not affect the original Word/Writer document.
                  </p>
                  <h3>What is saved where?</h3>
                  <p>
                    <strong>Word/Writer</strong> remains the home of the original
                    source text. Save source-text changes there as usual.
                  </p>
                  <p>
                    <strong>Semantic Logic Mapper</strong> automatically saves the
                    local workspace: boxes, connections, layouts, drafts and cited
                    source excerpts with their locators.
                  </p>
                  <p>
                    <strong>Save map file</strong> downloads a separate DOCX carrying
                    the editable map data. It does not replace or save the original
                    source document open in Word/Writer.
                  </p>
                  <p>
                    <strong>Open map file</strong> opens a DOCX previously saved by
                    Semantic Logic Mapper. It is not used to open a source document
                    for visualization.
                  </p>
                  <div className="notice">
                    If the source text changes in Word or Writer, ask the AI to
                    review the map and its source references again.
                  </div>
                </>
              )}
              {panel === "mcp" && (
                <>
                  <div className="connection-card">
                    <span className="connection-dot online" />
                    Shared local model
                  </div>
                  <p>
                    An external AI client can read and edit the same semantic
                    structure. Changes appear here immediately.
                  </p>
                  <ol className="instructions">
                    <li>
                      Keep this application and the local server running.
                    </li>
                    <li>
                      Connect the repository&apos;s <code>server/mcp.ts</code> to your MCP client as described in the setup guide.
                    </li>
                    <li>
                      Ask the client to read the current workspace before making targeted changes.
                    </li>
                  </ol>
                  <p>
                    Setup instructions are in the repository README. Enable the
                    connection separately in the AI application you use.
                  </p>
                  <div className="prompt-example">
                    “Read the active map. Change only N4 so that its remediation
                    period begins when written notice is received. Preserve all
                    other conditions.”
                  </div>
                  <h3>Shared presentation</h3>
                  <p>
                    Presentation mode hides editing controls. Share this browser
                    window in a meeting. No public share link is created.
                  </p>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
