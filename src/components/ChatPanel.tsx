import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Message } from '../../shared/model';

type Props = {
  messages: Message[];
  busy: boolean;
  onSubmit: (message: string, mode: 'chat' | 'graph') => Promise<void>;
};

const MAX_LENGTH = 60_000;

export function ChatPanel({ messages, busy, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  const looksLikeContractText = value.length > 500 || /(^|\n)\s*(\d+[.\)]|§|[A-ZÅÄÖ][A-ZÅÄÖ ]{5,})/.test(value);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function submit(mode: 'chat' | 'graph') {
    const message = value.trim();
    if (!message || busy) return;
    await onSubmit(message, mode);
    setValue('');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit('chat');
  }

  return (
    <section className="chat-panel" aria-label="Sopimuskeskustelu">
      <div className="brand-block">
        <span className="eyebrow">Sopimuskartta</span>
        <h1>Näe mitä tekstissä tapahtuu</h1>
        <p>Keskustele rakenteesta tai liitä tähän kokonainen sopimus tai yksittäinen kohta.</p>
      </div>

      <div className="chat-history" ref={historyRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <span className="empty-icon">⌘</span>
            <strong>Aloita kuvauksella tai tekstikatkelmalla</strong>
            <p>Esimerkiksi toimitusehto, irtisanomislauseke tai kokonainen sopimus käy sellaisenaan.</p>
          </div>
        ) : messages.map(message => (
          <article className={`message message--${message.role}`} key={message.id}>
            <span>{message.role === 'user' ? 'Sinä' : 'Avustaja'}</span>
            <p>{message.content}</p>
          </article>
        ))}
        {busy && <div className="thinking"><i /><i /><i /> Jäsennän sisältöä…</div>}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        {looksLikeContractText && (
          <div className="paste-notice"><span>✓</span> Sopimusteksti tunnistettu — voit visualisoida sen suoraan.</div>
        )}
        <textarea
          aria-label="Viesti tai sopimusteksti"
          placeholder="Kirjoita kysymys tai liitä sopimusteksti tähän…"
          value={value}
          maxLength={MAX_LENGTH}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void submit('graph');
            }
          }}
        />
        <div className="composer-footer">
          <span className="character-count">{value.length.toLocaleString('fi-FI')} / {MAX_LENGTH.toLocaleString('fi-FI')}</span>
          <div className="composer-actions">
            <button type="submit" className="button button--quiet" disabled={busy || !value.trim()}>Lähetä chattiin</button>
            <button type="button" className="button button--primary" onClick={() => void submit('graph')} disabled={busy || !value.trim()}>
              <span>✦</span> Visualisoi puuksi
            </button>
          </div>
        </div>
        <small>Ctrl/⌘ + Enter visualisoi suoraan. Tarkista aina AI:n tulkinta alkuperäisestä tekstistä.</small>
      </form>
    </section>
  );
}
