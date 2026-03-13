import { FormEvent, useState } from "react";

type ChatPanelProps = {
  onSubmitPrompt: (prompt: string) => void;
  isLoading?: boolean;
};

export function ChatPanel({ onSubmitPrompt, isLoading = false }: ChatPanelProps) {
  const [value, setValue] = useState(
    "financial maintenance covenant, net leverage max 3.5x quarterly, equity cure once per 12 months",
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmitPrompt(trimmed);
  };

  return (
    <div className="chat-panel">
      <h1 className="app-title">Contract structure designer</h1>
      <p className="app-subtitle">
        Describe the covenant or structure in free text. The system will suggest a graph structure
        that you can then refine visually.
      </p>

      <form onSubmit={handleSubmit} className="chat-form">
        <label htmlFor="prompt" className="chat-label">
          Free-form description
        </label>
        <textarea
          id="prompt"
          className="chat-textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
        />
        <button type="submit" className="chat-button" disabled={isLoading}>
          {isLoading ? "Suggesting..." : "Suggest graph"}
        </button>
      </form>

      <div className="chat-hint">
        <strong>Example:</strong>{" "}
        <span>
          financial maintenance covenant, net leverage max 3.5x quarterly, equity cure once per 12
          months, breach triggers event of default after 30 days if not cured
        </span>
      </div>
    </div>
  );
}
