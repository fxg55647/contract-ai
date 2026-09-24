import { useState } from "react";
import type { SourceDocument } from "../../shared/sources";

export function SourcesPanel({ documents, disabled, onImport }: {
  documents: SourceDocument[];
  disabled: boolean;
  onImport: (title: string, content: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  return <aside className="chat-panel" aria-label="Lähdeaineisto">
    <div className="panel-heading"><h2>Lähdeaineisto</h2>
      <button onClick={() => setAdding(!adding)}>+ Tuo teksti</button>
    </div>
    <div className="inspector-body">
      <p>Ohjaa mallinnusta ChatGPT:ssä. Voit tuoda sopimuksen sen kautta tai liittää tekstin tähän.</p>
      <p className="muted">Myös muita MCP:tä tukevia avustajia voi kokeilla. Sovellus ei tarvitse tekoälyn API-avainta.</p>
      {adding && <form onSubmit={async event => {
        event.preventDefault();
        if (saving || disabled) return;
        setSaving(true);
        try {
          if (await onImport(title.trim(), content)) { setContent(""); setTitle(""); setAdding(false); }
        } finally { setSaving(false); }
      }}>
        <label>Dokumentin nimi<input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required disabled={saving} /></label>
        <label>Alkuperäinen teksti<textarea value={content} onChange={e => setContent(e.target.value)} rows={12} maxLength={60000} required disabled={saving} /></label>
        <p className="muted">{content.length.toLocaleString("fi-FI")} / 60 000 merkkiä · Tallennetaan vain luettavaksi.</p>
        <button className="primary wide" disabled={disabled || saving || !title.trim() || !content.trim()}>{saving ? "Tuodaan…" : "Tuo ja pilko lähteiksi"}</button>
      </form>}
      {!documents.length && !adding && <p>Ei vielä lähdedokumentteja.</p>}
      {documents.map(document => <details className="source-excerpt" key={document.id}>
        <summary><span>{document.title}</span><small>{document.id}</small></summary>
        <p className="source-note">{document.fragments.length} katkelmaa · Vain luku</p>
        <blockquote>{document.content}</blockquote>
      </details>)}
      <div className="prompt-example">”Lue lähdedokumentit kokonaan ja muodosta niiden toimintalogiikasta kartta. Liitä mukaan kaikki relevantit lähdeviitteet.”</div>
    </div>
  </aside>;
}
