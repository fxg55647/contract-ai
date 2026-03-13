# contract-ai

Interactive contract structure editor powered by Claude AI. Describe a contract in plain language and the app generates a visual graph of the logic — nodes, decision points, and outcomes. From the graph you can generate formal legal clause text.

## Features

- **AI graph generation** — describe contract logic in natural language, Claude builds the graph
- **Interactive editor** — drag nodes, draw edges, add/edit/delete steps
- **Contract text generation** — convert the graph into formal legal clause language
- **Claude API integration** — bring your own API key, runs entirely in the browser

## Tech stack

- React 19 + TypeScript
- React Flow (graph canvas)
- Vite
- Claude API (claude-sonnet-4-6)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), enter your [Claude API key](https://console.anthropic.com/), and describe a contract structure in the chat panel.

## Build

```bash
npm run build
```
