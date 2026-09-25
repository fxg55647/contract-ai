import { useState } from "react";
import {
  type ContractNode,
  type ContractModel,
  type Operation,
} from "../../shared/model";
import { uniqueSourceReferences, type SourceDocument } from "../../shared/sources";
type Props = {
  node: ContractNode;
  model: ContractModel;
  sourceDocuments: SourceDocument[];
  readOnly: boolean;
  onClose: () => void;
  onChange: (
    operations: Operation[],
    summary: string,
    revision?: number,
  ) => Promise<boolean>;
};
export function Inspector({ node, model, sourceDocuments, readOnly, onClose, onChange }: Props) {
  const [draft, setDraft] = useState(() => ({ ...node, sourceRefs: uniqueSourceReferences(node.sourceRefs) }));
  const [baseRevision, setBaseRevision] = useState(model.revision);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const sourceExcerpts = uniqueSourceReferences(node.sourceRefs).flatMap((reference) => {
    const document = sourceDocuments.find((candidate) => candidate.id === reference.documentId);
    const fragment = document?.fragments.find((candidate) => candidate.id === reference.fragmentId);
    return document && fragment ? [{ document, fragment, quote: reference.quote }] : [];
  });
  const field = (key: keyof ContractNode, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  function removeSourceReference(index: number) {
    setDraft((current) => ({
      ...current,
      sourceRefs: current.sourceRefs.filter((_, candidateIndex) => candidateIndex !== index),
    }));
  }
  async function save() {
    setSaving(true);
    const { id, position: _position, ...changes } = draft;
    const ok = await onChange(
      [
        {
          type: "update_node",
          id,
          changes,
        },
      ],
      `${id}: ${draft.title} updated`,
      baseRevision,
    );
    setSaving(false);
    if (ok) setEditing(false);
  }
  return (
    <aside className="inspector" aria-label="Box details">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">BOX DETAILS</span>
          <h2>
            {node.id}{" "}
            {node.open && <span className="status status-open">Open</span>}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close box details"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="inspector-body">
        {editing && !readOnly ? (
          <>
            {model.revision !== baseRevision && (
              <div className="notice">
                The map changed while you were editing. Your text is preserved,
                but you must load the latest version before saving.
                <button
                  onClick={() => {
                    setDraft({ ...node, sourceRefs: uniqueSourceReferences(node.sourceRefs) });
                    setBaseRevision(model.revision);
                  }}
                >
                  Discard form changes and load latest
                </button>
              </div>
            )}
            <label>
              Title
              <input
                value={draft.title}
                onChange={(e) => field("title", e.target.value)}
                maxLength={100}
              />
            </label>
            <label>
              Content
              <textarea
                value={draft.text}
                onChange={(e) => field("text", e.target.value)}
                rows={8}
                maxLength={10000}
              />
            </label>
            <section className="source-reference-editor" aria-labelledby="node-label-heading">
              <span className="field-label" id="node-label-heading">Labels</span>
              {draft.open ? (
                <div className="removable-labels">
                  <span className="removable-label">
                    <span>Open</span>
                    <button
                      type="button"
                      className="removable-label-close"
                      aria-label="Remove Open label"
                      title="Remove label"
                      onClick={() => setDraft((current) => ({ ...current, open: false }))}
                    >
                      ×
                    </button>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className="add-label-button"
                  onClick={() => setDraft((current) => ({ ...current, open: true }))}
                >
                  + Mark as open
                </button>
              )}
            </section>
            {draft.sourceRefs.length > 0 && (
              <section className="source-reference-editor" aria-labelledby="source-reference-heading">
                <span className="field-label" id="source-reference-heading">Source references</span>
                <div className="removable-labels">
                  {draft.sourceRefs.map((reference, index) => {
                    const document = sourceDocuments.find((candidate) => candidate.id === reference.documentId);
                    const fragment = document?.fragments.find((candidate) => candidate.id === reference.fragmentId);
                    const label = fragment?.heading || document?.title || reference.fragmentId;
                    return (
                      <span className="removable-label" key={`${reference.fragmentId}-${index}`}>
                        <span title={label}>{label}</span>
                        <button
                          type="button"
                          className="removable-label-close"
                          aria-label={`Remove source reference ${reference.fragmentId}`}
                          title="Remove source reference"
                          onClick={() => removeSourceReference(index)}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                <p className="field-help">Removed references will no longer appear in this box.</p>
              </section>
            )}
            <div className="button-row">
              <button
                className="primary"
                disabled={
                  saving ||
                  !draft.title.trim() ||
                  model.revision !== baseRevision
                }
                onClick={() => void save()}
              >
                Save box
              </button>
              <button disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="inspector-title">{node.title}</h3>
            <p className="lead preserve">{node.text || "No content yet."}</p>
            {sourceExcerpts.length > 0 && (
              <section className="source-excerpts source-excerpts-prominent" aria-label="Original source excerpts">
                <div className="source-excerpts-heading">
                  <div>
                    <span className="eyebrow">ORIGINAL SOURCE TEXT</span>
                    <h3>{sourceExcerpts.length} {sourceExcerpts.length === 1 ? "source excerpt" : "source excerpts"}</h3>
                  </div>
                  <span className="read-only-tag">Read only</span>
                </div>
                {sourceExcerpts.map(({ document, fragment, quote }, index) => (
                  <details className="source-excerpt" key={`${fragment.id}-${index}`} open>
                    <summary>
                      <span>{fragment.heading || document.title}</span>
                      <small>{fragment.locator ? `${fragment.id} · ${fragment.locator}` : fragment.id}</small>
                    </summary>
                    <blockquote>{quote ?? fragment.text}</blockquote>
                    {quote && quote !== fragment.text && (
                      <details><summary>Show full source passage</summary><blockquote>{fragment.text}</blockquote></details>
                    )}
                  </details>
                ))}
                <p className="source-note">Exact excerpts from the open Word/Writer source. The complete source document is not stored in Semantic Logic Mapper.</p>
              </section>
            )}
            {!readOnly && (
              <div className="button-row">
                <button
                  className="primary"
                  onClick={() => {
                    setDraft({ ...node, sourceRefs: uniqueSourceReferences(node.sourceRefs) });
                    setBaseRevision(model.revision);
                    setEditing(true);
                  }}
                >
                  Edit box
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
