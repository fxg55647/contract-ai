import { useCallback, useRef, useState, useEffect } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { GraphEditor } from "./components/GraphEditor";
import { ApiKeyInput } from "./components/ApiKeyInput";
import type { GraphNode, GraphEdge } from "./types";

const API_KEY_STORAGE = "claude-api-key";
const MODEL = "claude-sonnet-4-6";

type RawNode = { id: string; name: string; description?: string[] };
type RawEdge = { from: string; to: string };

const NODE_WIDTH = 260;
const X_GAP = NODE_WIDTH + 60;
const Y_GAP = 160;

function autoLayout(entryId: string, rawNodes: RawNode[], edges: RawEdge[]): GraphNode[] {
  const levels = new Map<string, number>();
  const queue: string[] = [entryId];
  levels.set(entryId, 0);

  let i = 0;
  while (i < queue.length) {
    const id = queue[i++];
    const level = levels.get(id)!;
    for (const e of edges.filter((e) => e.from === id)) {
      if (!levels.has(e.to)) {
        levels.set(e.to, level + 1);
        queue.push(e.to);
      }
    }
  }
  rawNodes.forEach((n) => { if (!levels.has(n.id)) levels.set(n.id, 0); });

  const byLevel = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(id);
  }

  return rawNodes.map((n) => {
    const level = levels.get(n.id) ?? 0;
    const row = byLevel.get(level)!;
    const idx = row.indexOf(n.id);
    const rawDesc = n.description;
    const description: string[] = Array.isArray(rawDesc)
      ? rawDesc
      : rawDesc != null
      ? [String(rawDesc)]
      : [];
    return {
      id: n.id,
      name: n.name,
      description,
      position: {
        x: (idx - (row.length - 1) / 2) * X_GAP,
        y: level * Y_GAP,
      },
    };
  });
}

function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

async function callClaude(apiKey: string, messages: { role: string; content: string }[]) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, messages }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `HTTP ${response.status}`);
  }
  const data = (await response.json()) as { content?: { text?: string }[] };
  return data.content?.[0]?.text ?? "";
}

const SUGGEST_PROMPT = `Muunna käyttäjän kuvaama sopimuslogiikka eksplisiittiseksi graafiksi.
Palauta vain JSON muodossa { entry, nodes, edges }.

Säännöt:

Käytä nodeille kenttiä id, name, description.

Käytä edgeille kenttiä from, to.

id on lyhyt ja vakaa snake_case-tunniste.

name on lyhyt, näkyvä, 2–4 sanan ihmisen luettava nimi. Älä käytä pitkiä juridisia lauseita.

description on valinnainen string-taulukko. Laita yksityiskohdat sinne.

Kaikkien nodejen tulee olla saavutettavissa entry-nodesta.

Jokaisella ei-terminaalisella nodella tulee olla vähintään yksi lähtevä edge.

Graafi etenee pääasiassa ylhäältä alas, vaihe vaiheelta. Vältä leveää vaakarakennetta.

Jos päätöksellä on useita lopputuloksia, tee jokaisesta oma edge.

Palauta vain validi JSON, ei selitystekstiä.`;

function App() {
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [currentNodes, setCurrentNodes] = useState<GraphNode[]>([]);
  const [currentEdges, setCurrentEdges] = useState<GraphEdge[]>([]);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.55);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? "");
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(API_KEY_STORAGE, apiKey);
  }, [apiKey]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      setSplitRatio(Math.min(0.85, Math.max(0.2, (event.clientY - rect.top) / rect.height)));
    };
    const handleMouseUp = () => { isDraggingRef.current = false; };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleGraphChange = useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    setCurrentNodes(nodes);
    setCurrentEdges(edges);
  }, []);

  const handleSubmitPrompt = async (prompt: string) => {
    if (!apiKey.trim()) {
      alert("Please enter your Claude API key first.");
      return;
    }
    setIsSuggesting(true);
    try {
      const text = await callClaude(apiKey, [
        { role: "user", content: SUGGEST_PROMPT + "\n\nKuvaus: " + prompt },
      ]);
      const parsed = JSON.parse(extractJson(text)) as {
        entry: string;
        nodes: RawNode[];
        edges: RawEdge[];
      };
      setGraphNodes(autoLayout(parsed.entry, parsed.nodes, parsed.edges));
      setGraphEdges(
        parsed.edges.map((e, i) => ({ id: `e${i}_${e.from}_${e.to}`, source: e.from, target: e.to })),
      );
    } catch (err) {
      alert(`Graph suggestion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSuggesting(false);
    }
  };

  const generateContract = async () => {
    if (!apiKey.trim()) {
      alert("Please enter your Claude API key first.");
      return;
    }
    setIsGenerating(true);
    setGeneratedText(null);
    try {
      const nodeList = currentNodes
        .map((n) => `- "${n.name}"${n.description.length > 0 ? ": " + n.description.join("; ") : ""}`)
        .join("\n");
      const edgeList = currentEdges
        .map((e) => {
          const from = currentNodes.find((n) => n.id === e.source)?.name ?? e.source;
          const to = currentNodes.find((n) => n.id === e.target)?.name ?? e.target;
          return `- "${from}" → "${to}"`;
        })
        .join("\n");

      const prompt = `You are a legal drafting expert specialising in finance and commercial contracts. Based on the following contract structure graph, generate formal contract clause language.\n\nNodes:\n${nodeList}\n\nRelationships:\n${edgeList}\n\nGenerate clear, formal contract text as numbered legal clauses. Be precise and use standard legal drafting conventions.`;

      setGeneratedText(await callClaude(apiKey, [{ role: "user", content: prompt }]));
    } catch (err) {
      setGeneratedText(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="app-root">
      <div className="app-layout">
        <aside className="app-sidebar" ref={sidebarRef}>
          <div className="sidebar-split">
            <section
              className="sidebar-pane sidebar-pane--top"
              style={{ flexBasis: `${splitRatio * 100}%` }}
            >
              <ChatPanel onSubmitPrompt={handleSubmitPrompt} isLoading={isSuggesting} />
            </section>

            <div className="sidebar-resizer" onMouseDown={() => { isDraggingRef.current = true; }}>
              <div className="sidebar-resizer-handle" />
            </div>

            <section
              className="sidebar-pane sidebar-pane--bottom"
              style={{ flexBasis: `${(1 - splitRatio) * 100}%` }}
            >
              <div className="generated-text-panel">
                <h1 className="app-title">Draft contract text</h1>

                <ApiKeyInput value={apiKey} onChange={setApiKey} />

                <button
                  type="button"
                  className="generate-button"
                  onClick={generateContract}
                  disabled={isGenerating}
                >
                  {isGenerating ? "Generating..." : "Generate contract text"}
                </button>

                <div className="generated-text-body">
                  {isGenerating ? (
                    <p className="generated-text-empty">Calling Claude, please wait...</p>
                  ) : generatedText ? (
                    <pre>{generatedText}</pre>
                  ) : (
                    <p className="generated-text-empty">
                      Enter your API key and click the button above to generate contract text from
                      the current graph.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </aside>

        <main className="app-main">
          <GraphEditor
            initialNodes={graphNodes}
            initialEdges={graphEdges}
            onGraphChange={handleGraphChange}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
