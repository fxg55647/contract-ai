const base = 'http://127.0.0.1:4317';
const state = await (await fetch(base + '/api/state')).json();
const quotes = [
  ['COV NetDebt/EBITDA(th=3.50, test=6mo, consec=2, waiver=written/reset, cert=req);'],
  ['COV NetDebt/EBITDA(th=3.50, test=6mo, consec=2, waiver=written/reset, cert=req);'],
  ['ELSE IF breach => Watchlist; ELSE Compliant.'],
  ['consec=2', 'IF breach×2&&!waiver => EoD;'],
  ['IF breach×2&&!waiver => EoD;', 'ELSE IF breach => Watchlist; ELSE Compliant.'],
  ['waiver=written/reset', 'IF breach×2&&!waiver => EoD;'],
  ['waiver=written/reset', 'ELSE IF breach => Watchlist; ELSE Compliant.'],
  ['IF breach×2&&!waiver => EoD;'],
  ['IF breach×2&&!waiver => EoD; remedies=[cure≤30d, margin+≤2.00pp, accelerate];'],
];
if (state.model.title !== 'NetDebt / EBITDA — 3,50-kovenantti' || state.model.nodes.length !== quotes.length) throw new Error('Unexpected model; no changes made');
const document = state.sourceDocuments.find(d => d.title === 'NetDebt / EBITDA covenant');
if (!document) throw new Error('Source missing');
const operations = state.model.nodes.map((node, i) => ({ type: 'update_node', id: node.id, changes: { sourceRefs: quotes[i].map(quote => {
  const fragment = document.fragments.find(f => f.text.includes(quote));
  if (!fragment) throw new Error('Quote missing from source');
  return { documentId: document.id, fragmentId: fragment.id, quote };
}) } }));
const response = await fetch(base + '/api/changes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: state.model.revision, summary: 'Laatikkokohtaiset sanatarkat lähdelainaukset', operations }) });
const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result));
console.log(JSON.stringify(result.model.nodes.map(n => ({ id: n.id, quotes: n.sourceRefs.map(r => r.quote) }))));
