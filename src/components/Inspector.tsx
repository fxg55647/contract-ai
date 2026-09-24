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
      `${id}: ${draft.title} päivitetty`,
      baseRevision,
    );
    setSaving(false);
    if (ok) setEditing(false);
  }
  return (
    <aside className="inspector" aria-label="Vaiheen tiedot">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">VAIHEEN TIEDOT</span>
          <h2>
            {node.id}{" "}
            {node.open && <span className="status status-open">Avoin</span>}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Sulje vaiheen tiedot"
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
                Rakenne muuttui muokkauksen aikana. Tekstisi säilyy, mutta
                tallennus edellyttää uusimman version avaamista.
                <button
                  onClick={() => {
                    setDraft({ ...node, sourceRefs: uniqueSourceReferences(node.sourceRefs) });
                    setBaseRevision(model.revision);
                  }}
                >
                  Hylkää lomakemuutokset ja lataa uusin
                </button>
              </div>
            )}
            <label>
              Otsikko
              <input
                value={draft.title}
                onChange={(e) => field("title", e.target.value)}
                maxLength={100}
              />
            </label>
            <label>
              Sisältö
              <textarea
                value={draft.text}
                onChange={(e) => field("text", e.target.value)}
                rows={8}
                maxLength={10000}
              />
            </label>
            <section className="source-reference-editor" aria-labelledby="node-label-heading">
              <span className="field-label" id="node-label-heading">Merkinnät</span>
              {draft.open ? (
                <div className="removable-labels">
                  <span className="removable-label">
                    <span>Avoin</span>
                    <button
                      type="button"
                      className="removable-label-close"
                      aria-label="Poista Avoin-merkintä"
                      title="Poista merkintä"
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
                  + Merkitse avoimeksi
                </button>
              )}
            </section>
            {draft.sourceRefs.length > 0 && (
              <section className="source-reference-editor" aria-labelledby="source-reference-heading">
                <span className="field-label" id="source-reference-heading">Lähdeviitteet</span>
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
                          aria-label={`Poista lähdeviite ${reference.fragmentId}`}
                          title="Poista lähdeviite"
                          onClick={() => removeSourceReference(index)}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                <p className="field-help">Poistetut viitteet eivät enää näy tässä vaiheessa.</p>
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
                Tallenna vaihe
              </button>
              <button disabled={saving} onClick={() => setEditing(false)}>
                Peruuta
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="inspector-title">{node.title}</h3>
            <p className="lead preserve">{node.text || "Sisältöä ei vielä ole."}</p>
            {sourceExcerpts.length > 0 && (
              <section className="source-excerpts source-excerpts-prominent" aria-label="Alkuperäiset sopimuskohdat">
                <div className="source-excerpts-heading">
                  <div>
                    <span className="eyebrow">ALKUPERÄINEN SOPIMUSTEKSTI</span>
                    <h3>{sourceExcerpts.length} {sourceExcerpts.length === 1 ? "lähdekohta" : "lähdekohtaa"}</h3>
                  </div>
                  <span className="read-only-tag">Vain luku</span>
                </div>
                {sourceExcerpts.map(({ document, fragment, quote }, index) => (
                  <details className="source-excerpt" key={`${fragment.id}-${index}`} open>
                    <summary>
                      <span>{fragment.heading || document.title}</span>
                      <small>{fragment.id}</small>
                    </summary>
                    <blockquote>{quote ?? fragment.text}</blockquote>
                    {quote && quote !== fragment.text && (
                      <details><summary>Näytä koko lähdekappale</summary><blockquote>{fragment.text}</blockquote></details>
                    )}
                  </details>
                ))}
                <p className="source-note">Sanatarkat, muuttumattomat otteet käyttäjän liittämästä sopimuksesta.</p>
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
                  Muokkaa vaihetta
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
