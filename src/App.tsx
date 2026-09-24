import { useEffect, useRef, useState } from "react";
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

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [state, setState] = useState<Workspace | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [writing, setWriting] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [panel, setPanel] = useState<
    "issues" | "draft" | "history" | "mcp" | null
  >(null);
  const [edgeEdit, setEdgeEdit] = useState<{
    id: string;
    label: string;
    revision: number;
  } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // The previous prototype persisted credentials; the new UI never retains them.
    localStorage.removeItem("claude-api-key");
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
        <h1>Sopimuskartta</h1>
        <p>
          {connected
            ? "Avataan yhteistä työtilaa…"
            : "Yhdistetään paikalliseen työtilaan…"}
        </p>
        <p className="muted">Käynnistä sovellus komennolla npm run dev.</p>
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
  async function importModel(value: unknown) {
    if (
      await action(value && typeof value === "object" && "format" in value ? "package" : "import", value && typeof value === "object" && "format" in value ? { package: value, expectedRevision: model.revision } : { model: value, expectedRevision: model.revision })
    )
      setFitToken((v) => v + 1);
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
            <strong>Sopimuskartta</strong>
            <span>Sopimus näkyväksi. Yhdessä.</span>
          </div>
        </div>
        <div className="workspace-status">
          <span className={`connection-dot ${connected ? "online" : ""}`} />
          {connected
            ? "Tallennettu paikallisesti"
            : "Yhteys katkennut — yhdistetään uudelleen"}
          <span className="version">v{model.revision}</span>
        </div>
        <div className="top-actions">
          {!presenting && (
            <>
                <button onClick={() => showPanel("draft")}>
                  Tekstiluonnos ↗
                </button>
                <button
                  onClick={() =>
                    download(
                      "sopimusrakenne.json",
                      JSON.stringify({ format: "contract-map", formatVersion: 1, model, sourceDocuments: state.sourceDocuments }, null, 2),
                      "application/json",
                    )
                  }
                >
                  Vie JSON
                </button>
                <button
                  disabled={!editable}
                  onClick={() => importInput.current?.click()}
                >
                  Tuo JSON
                </button>
                <input
                  ref={importInput}
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  aria-label="Tuo sopimusrakenne"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await importModel(JSON.parse(await file.text()));
                    } catch {
                      setError("Tiedosto ei ole kelvollista JSONia.");
                    }
                    e.target.value = "";
                  }}
                />
            </>
          )}
          <button onClick={() => showPanel("mcp")}>MCP-yhteys ↗</button>
          <button
            className={presenting ? "primary" : ""}
            onClick={() => {
              setPresenting((v) => !v);
              setFitToken((v) => v + 1);
            }}
          >
            {presenting ? "Lopeta esitys" : "Esitysnäkymä"}
          </button>
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
      <div className="workspace">
        <main className="canvas-panel">
          <div className="graph-area">
            <ContractCanvas
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
                  <span>Tilanne</span>
                  <i>↓</i>
                  <span className="decision-example">Mitä tapahtuu?</span>
                  <i>↙　↘</i>
                  <div>
                    <span>Vaihtoehto A</span>
                    <span>Vaihtoehto B</span>
                  </div>
                </div>
                <h2>
                  Yhteinen kuva siitä,
                  <br />
                  mitä on tarkoitus sopia.
                </h2>
                <p>
                  Keskustelkaa ensin. Muodostakaa sitten kartta,
                  <br />
                  josta jokainen näkee ehdot ja seuraukset.
                </p>
                <div className="button-row">
                  <button
                    disabled={!editable}
                    className="primary"
                    onClick={() => void importModel(exampleModel())}
                  >
                    Tutustu esimerkillä
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
              <h2>Yhteyden ehto</h2>
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
                Milloin tätä polkua seurataan?
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
                        "Yhteyden ehto täsmennetty",
                        edgeEdit.revision,
                      )
                    )
                      setEdgeEdit(null);
                  }}
                >
                  Tallenna ehto
                </button>
                <button
                  disabled={!editable}
                  onClick={async () => {
                    if (
                      await change(
                        [{ type: "delete_edge", id: edgeEdit.id }],
                        "Yhteys poistettu",
                        edgeEdit.revision,
                      )
                    )
                      setEdgeEdit(null);
                  }}
                >
                  Poista yhteys
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
                    issues: "Avoimet asiat",
                    draft: "Tekstiluonnos",
                    history: "Muutoshistoria",
                    mcp: "MCP-yhteys",
                  }[panel]
                }
              </h2>
              <button
                className="icon-button"
                aria-label="Sulje sivupaneeli"
                onClick={() => setPanel(null)}
              >
                ×
              </button>
            </div>
            <div className="inspector-body">
              {panel === "issues" && (
                <>
                  {openNodes.length === 0 && (
                    <p>Ei kirjattuja avoimia kysymyksiä.</p>
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
                      <p>{n.text || "Vaihe odottaa täsmennystä."}</p>
                    </button>
                  ))}
                  <h3>Rakenteen tarkistus</h3>
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
                      Rakenteellisia puutteita ei havaittu. Tämä ei vahvista
                      sopimuksen sisällön oikeellisuutta.
                    </p>
                  )}
                </>
              )}
              {panel === "history" && (
                <>
                  {!state.history.length && <p>Ei vielä muutoksia.</p>}
                  {[...state.history].reverse().map((c) => (
                    <article className="history-item" key={c.revision}>
                      <span className="eyebrow">
                        VERSIO {c.revision} ·{" "}
                        {c.actor === "editor" ? "KÄSIN" : c.actor.toUpperCase()}
                      </span>
                      <h3>{c.summary}</h3>
                      <p>
                        {c.added.length > 0 &&
                          `Lisätty: ${c.added.join(", ")}. `}
                        {c.updated.length > 0 &&
                          `Muutettu: ${c.updated.join(", ")}. `}
                        {c.removed.length > 0 &&
                          `Poistettu: ${c.removed.join(", ")}.`}
                      </p>
                    </article>
                  ))}
                </>
              )}
              {panel === "draft" && (
                <>
                  <p>
                    Luonnos muodostetaan nykyisestä rakenteesta. Avoimet kohdat
                    jätetään näkyviin.
                  </p>
                  <p className="prompt-example">
                    Pyydä ChatGPT:ssä: ”Muodosta nykyisestä mallista sopimusluonnos ja tallenna se työtilaan. Merkitse avoimet ehdot.”
                  </p>
                  {state.draft && (
                    <>
                      {state.draft.revision !== model.revision && (
                        <div className="notice">
                          Rakenne on muuttunut. Tämä teksti perustuu versioon{" "}
                          {state.draft.revision}.
                        </div>
                      )}
                      <div className="draft-text">{state.draft.text}</div>
                      <button
                        onClick={() =>
                          download(
                            "sopimusluonnos.txt",
                            state.draft!.text,
                            "text/plain;charset=utf-8",
                          )
                        }
                      >
                        Lataa teksti
                      </button>
                    </>
                  )}
                </>
              )}
              {panel === "mcp" && (
                <>
                  <div className="connection-card">
                    <span className="connection-dot online" />
                    Yhteinen paikallinen malli
                  </div>
                  <p>
                    Ulkoinen tekoäly voi lukea ja muokata samaa
                    sopimusrakennetta. Muutokset näkyvät tässä heti.
                  </p>
                  <ol className="instructions">
                    <li>
                      Pidä tämä sovellus ja paikallinen palvelin käynnissä.
                    </li>
                    <li>
                      Liitä MCP-asiakkaaseen repon <code>server/mcp.ts</code>{" "}
                      ohjeen mukaan.
                    </li>
                    <li>
                      Pyydä lukemaan nykyinen työtila ja tekemään rajattuja
                      muutoksia.
                    </li>
                  </ol>
                  <p>
                    Asennusohje on repon README-tiedostossa. Yhteyden
                    käyttöönotto tehdään erikseen käyttämässäsi
                    tekoälysovelluksessa.
                  </p>
                  <div className="prompt-example">
                    ”Lue sopimuskartta. Muuta N4:n korjausaika alkamaan
                    kirjallisen ilmoituksen vastaanottamisesta. Säilytä muut
                    ehdot.”
                  </div>
                  <h3>Yhteinen esitys</h3>
                  <p>
                    Esitysnäkymä piilottaa muokkauspainikkeet.
                    Voit jakaa tämän selainikkunan kokouksessa. Julkista
                    jakolinkkiä ei luoda.
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
