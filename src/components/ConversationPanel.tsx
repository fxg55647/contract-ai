import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../../shared/model";
type Props = {
  state: Workspace;
  busy: boolean;
  apiKey: string;
  onKey: (key: string) => void;
  onSend: (text: string, mode: "chat" | "graph" | "draft", sourceDocument?: boolean) => Promise<boolean>;
};
export function ConversationPanel({
  state,
  busy,
  apiKey,
  onKey,
  onSend,
}: Props) {
  const [text, setText] = useState("");
  const [pastedSource, setPastedSource] = useState(false);
  const [settings, setSettings] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  useEffect(() => {
    history.current?.scrollTo({
      top: history.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state.messages.length, busy]);
  const selected = state.model.nodes.find((n) => n.id === state.selection);
  const available = state.aiConfigured || Boolean(apiKey.trim());
  const looksLikeText = text.length > 500 || /(^|\n)\s*(\d+[.\)]|§)/.test(text);
  const sourceDocument = pastedSource || looksLikeText;
  async function send(mode: "chat" | "graph") {
    if (
      !busy &&
      available &&
      (text.trim() || (mode === "graph" && state.messages.length))
    ) {
      if (await onSend(text, mode, sourceDocument)) {
        setText("");
        setPastedSource(false);
      }
    }
  }
  return (
    <aside className="chat-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YHTEINEN YMMÄRRYS</span>
          <h2>Keskustelu</h2>
        </div>
        <button
          className="icon-button"
          onClick={() => setSettings(!settings)}
          aria-label="Yhteysasetukset"
        >
          ⚙
        </button>
      </div>
      {settings && (
        <div className="settings-box">
          <strong>Keskustelu tässä näkymässä</strong>
          <p>
            Claude-avain säilyy vain tämän sivun muistissa. MCP-käyttö ei
            tarvitse avainta tässä.
          </p>
          <label>
            API-avain
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onKey(e.target.value)}
              placeholder={
                state.aiConfigured ? "Palvelimen avain käytössä" : "sk-ant-…"
              }
              autoComplete="off"
            />
          </label>
        </div>
      )}
      <div className="messages" aria-live="polite" ref={history}>
        {!state.messages.length && (
          <div className="conversation-intro">
            <span className="intro-icon">✳</span>
            <h3>Mistä ollaan sopimassa?</h3>
            <p>
              Kerro tilanne omin sanoin tai liitä sopimusteksti. Pohtikaa
              vaihtoehtoja ja tehkää rakenne näkyväksi, kun se auttaa
              keskustelua.
            </p>
            <div className="prompt-example">
              ”Sovimme toimituksesta. Haluan käydä läpi, mitä tapahtuu, jos
              toimitus viivästyy.”
            </div>
            <p className="muted">
              Voit myös keskustella ulkoisen tekoälyn kanssa MCP-yhteydellä. Sen
              tekemät muutokset näkyvät viereisessä kartassa.
            </p>
          </div>
        )}
        {state.messages.map((m) => (
          <article className={`message message-${m.role}`} key={m.id}>
            <span className="message-role">
              {m.role === "user" ? "Sinä" : "Avustaja"}
            </span>
            <div>{m.content}</div>
          </article>
        ))}
        {busy && (
          <div className="thinking">
            <span className="pulse" /> Avustaja työskentelee…
          </div>
        )}
      </div>
      <div className="composer">
        {selected && (
          <div className="context-chip">
            Keskustelun kohde:{" "}
            <strong>
              {selected.id} · {selected.title}
            </strong>
          </div>
        )}
        {sourceDocument && (
          <div className="context-chip">
            Liitetty teksti tallennetaan muuttumattomaksi lähteeksi.
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send("chat");
          }}
        >
          <label className="sr-only" htmlFor="chat-message">
            Viesti tai sopimusteksti
          </label>
          <textarea
            id="chat-message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData.getData("text/plain").trim().length >= 40)
                setPastedSource(true);
            }}
            placeholder="Kerro tavoite, kysy tai liitä sopimusteksti…"
            rows={4}
            maxLength={60000}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send("graph");
              }
            }}
          />
          <div className="composer-bottom">
            <span>
              {available
                ? text.length
                  ? `${text.length.toLocaleString("fi-FI")} / 60 000 merkkiä`
                  : "Keskustelu ennen luonnosta"
                : "Lisää API-avain asetuksista"}
            </span>
            <button
              type="submit"
              className="send-button"
              disabled={busy || !text.trim() || !available}
              aria-label="Lähetä viesti"
            >
              ↑
            </button>
          </div>
        </form>
        <button
          className="primary wide"
          disabled={
            busy || !available || (!text.trim() && !state.messages.length)
          }
          onClick={() => void send("graph")}
        >
          {sourceDocument
            ? "Visualisoi teksti rakenteeksi"
            : state.model.nodes.length
              ? "Päivitä rakenne keskustelusta"
              : "Muodosta rakenne keskustelusta"}{" "}
          <span>↗</span>
        </button>
        <p className="composer-note">
          Ctrl/⌘ + Enter muodostaa rakenteen. Avoimet asiat näkyvät kartassa.
        </p>
      </div>
    </aside>
  );
}
