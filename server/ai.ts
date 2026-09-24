import { z } from "zod";
import { proposalSchema, ModelError, type Workspace } from "../shared/model";
import { SYSTEM_PROMPT } from "../shared/prompts";

export type AiMode = "chat" | "graph" | "draft";
export async function askClaude(
  state: Workspace,
  mode: AiMode,
  apiKey: string,
) {
  if (mode === "draft" && !state.model.nodes.length)
    throw new ModelError("Luo ensin sopimusrakenne.");
  const instruction =
    mode === "graph"
      ? "Muodosta tai päivitä graafi keskustelun perusteella submit_graph_changes-työkalulla. Viimeisin käyttäjäviesti voi olla sellaisenaan liitetty sopimus tai sopimuksen osa: tulkitse se lähdeaineistoksi ja visualisoi sen toimintalogiikka. Säilytä nykyinen sisältö, ellei muutosta pyydetty. Anna uusille nodeille tilaa: 350 px vaakaväli, 300 px pystyväli. Älä muuta vanhojen sijainteja."
      : mode === "draft"
        ? "Kirjoita nykyisen mallin mukainen sopimustekstin luonnos. Lisää nodeviitteet ja kaikki avoimet kohdat. Älä täydennä niitä oletuksilla."
        : "Jatka keskustelua. Älä muuta graafia. Käyttäjä pyytää graafin erillisellä painikkeella.";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: 12000,
      system: SYSTEM_PROMPT + "\n\nTämän kutsun tehtävä: " + instruction,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            model: state.model,
            selectedNodeId: state.selection,
            conversation: state.messages,
            sourceDocuments: state.sourceDocuments.map(({ content: _content, ...document }) => document),
          }),
        },
      ],
      ...(mode === "graph"
        ? {
            tools: [
              {
                name: "submit_graph_changes",
                description:
                  "Rajattu muutos yhteiseen sopimusmalliin. Käytä pysyviä tunnisteita. Ei koko mallin korvaamista.",
                input_schema: z.toJSONSchema(proposalSchema),
              },
            ],
            tool_choice: { type: "tool", name: "submit_graph_changes" },
          }
        : {}),
    }),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new ModelError(
      `Mallipalvelun virhe: ${error.error?.message ?? response.status}`,
      502,
    );
  }
  const body = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string; name?: string; input?: unknown }[];
  };
  if (body.stop_reason === "max_tokens")
    throw new ModelError(
      "Mallin vastaus jäi kesken. Rajaa pyyntöä pienempään osaan; rakennetta ei muutettu.",
      502,
    );
  if (mode === "graph") {
    const calls =
      body.content?.filter(
        (block) =>
          block.type === "tool_use" && block.name === "submit_graph_changes",
      ) ?? [];
    if (calls.length !== 1)
      throw new ModelError(
        "Malli ei palauttanut yhtä kelvollista muutosehdotusta.",
        502,
      );
    return { proposal: proposalSchema.parse(calls[0].input), text: "" };
  }
  const text = body.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
  if (!text)
    throw new ModelError("Mallipalvelu palautti tyhjän vastauksen.", 502);
  return { text, proposal: null };
}
