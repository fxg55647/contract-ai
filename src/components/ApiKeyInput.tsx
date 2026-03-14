import { useState } from "react";

type Props = {
  value: string;
  onChange: (key: string) => void;
};

export function ApiKeyInput({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <div className="api-key-row">
      <button
        type="button"
        className="api-key-toggle-link"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "▾" : "▸"} API key{value ? " ✓" : ""}
      </button>
      {expanded && (
        <div className="api-key-field">
          <input
            id="api-key-input"
            type={visible ? "text" : "password"}
            className="api-key-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="api-key-toggle"
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
      )}
    </div>
  );
}
