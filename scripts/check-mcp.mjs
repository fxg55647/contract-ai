const contractUrl = process.env.CONTRACT_SERVER_URL || "http://127.0.0.1:4317";
const nelsonUrl = process.env.NELSON_MCP_URL || "http://127.0.0.1:8766/mcp";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: vastaus ei ollut JSON-muodossa`);
  }
  if (!response.ok) {
    throw new Error(value?.error?.message || value?.error || `HTTP ${response.status}`);
  }
  return { response, value };
}

async function checkContract() {
  const { value } = await request(`${contractUrl}/api/state`);
  console.log(
    `OK contract-editor: revision ${value.model?.revision ?? "?"}, dokumentti ${value.document?.fileName ?? "?"}`,
  );
}

async function checkNelson() {
  const headers = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  };
  const initialized = await request(nelsonUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "contract-editor-check", version: "1.0.0" },
      },
    }),
  });
  const sessionId = initialized.response.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("Nelson ei palauttanut MCP-istunnon tunnistetta");
  const sessionHeaders = { ...headers, "mcp-session-id": sessionId };
  const listed = await request(nelsonUrl, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  const tools = listed.value.result?.tools ?? [];
  if (!tools.some((tool) => tool.name === "doc_list_open")) {
    throw new Error("Nelson vastasi, mutta doc_list_open-työkalu puuttuu");
  }
  const documents = await request(nelsonUrl, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "doc_list_open", arguments: {} },
    }),
  });
  const text = documents.value.result?.content?.map((item) => item.text).filter(Boolean).join(" ") || "";
  let count = "?";
  try {
    count = JSON.parse(text).count ?? "?";
  } catch {
    // Työkalun vapaa tekstivastaus on silti hyväksyttävä, jos kutsu onnistui.
  }
  const version = initialized.value.result?.serverInfo?.version ?? "?";
  console.log(`OK LibreOffice/Nelson ${version}: ${tools.length} työkalua, avoimia dokumentteja ${count}`);
}

let failed = false;
for (const [name, check] of [
  ["contract-editor", checkContract],
  ["LibreOffice/Nelson", checkNelson],
]) {
  try {
    await check();
  } catch (error) {
    failed = true;
    console.error(`VIRHE ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exitCode = 1;

