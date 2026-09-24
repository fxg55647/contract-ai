import { writeFileSync, mkdirSync } from 'node:fs';
const base = 'http://127.0.0.1:4317';
async function api(path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}
const before = await api('/api/state');
mkdirSync('.contract-data/backups', { recursive: true });
const backup = await fetch(base + '/api/document/save', { method: 'POST' });
if (!backup.ok) throw new Error('DOCX backup failed');
writeFileSync(`.contract-data/backups/before-covenant-${Date.now()}.docx`, Buffer.from(await backup.arrayBuffer()));
const content = 'COV NetDebt/EBITDA(th=3.50, test=6mo, consec=2, waiver=written/reset, cert=req);\nIF breach×2&&!waiver => EoD; remedies=[cure≤30d, margin+≤2.00pp, accelerate];\nELSE IF breach => Watchlist; ELSE Compliant.';
const source = await api('/api/sources', { title: 'NetDebt / EBITDA covenant', content });
const excerpts = await api(`/api/sources/${source.documentId}/fragments?limit=30`);
if (excerpts.nextOffset !== null) throw new Error('Source reading incomplete');
const refs = excerpts.fragments.map(f => ({ documentId: source.documentId, fragmentId: f.id }));
let next = before.model.nextNodeNumber;
const nodes = [];
function node(title, summary, x, y, details = '', question = '') {
  const id = `N${next++}`;
  nodes.push({ id, title, text: [summary, details, question ? `Avoin kysymys: ${question}` : ''].filter(Boolean).join('\n\n'), open: Boolean(question), sourceRefs: refs, position: { x, y } });
  return id;
}
const start = node('Testi 6 kuukauden välein', 'NetDebt / EBITDA: raja 3,50. Kovenanttitodistus vaaditaan.', 400, 0, 'Lähde: test=6mo; cert=req. Todistuksen toimittajaa, määräaikaa ja puuttumisen seurausta ei määritetä.');
const breach = node('Ylittyykö raja 3,50?', 'Tarkista tämän testijakson NetDebt / EBITDA.', 400, 300, 'Mallinnusoletus: breach tarkoittaa suhdelukua > 3,50; arvo 3,50 sallitaan. Lähde antaa kynnyksen mutta ei vertailuoperaattoria.', 'Vahvistetaanko, että rikkomus syntyy vasta arvolla > 3,50?');
const compliant = node('Ei ylitystä → Compliant', 'Kovenantti täyttyy tällä testijaksolla.', 0, 650, 'Perustuu ELSE Compliant -haaraan. Ei peräkkäistä rikkomusta tällä jaksolla.');
const twice = node('Ylitys: toinen peräkkäinen?', 'Tarkista, onko rikkomuksia kahdessa peräkkäisessä testissä.', 700, 650, 'consec=2 ja breach×2. Kirjallinen waiver nollaa rikkomussarjan.');
const watch = node('Ensimmäinen → Watchlist', 'Yksi rikkomus johtaa seurantaan.', 350, 1000);
const waiver = node('Toinen: kirjallinen waiver?', 'EoD syntyy vain ilman soveltuvaa kirjallista waiveria.', 1050, 1000);
const reset = node('Waiver → nollaus, Watchlist', 'Kirjallinen waiver nollaa sarjan. Nykyinen rikkomus jää ELSE IF breach -haaraan.', 700, 1370, 'Kirjaimellinen IF / ELSE IF -tulkinta: waiver estää EoD:n, mutta breach on edelleen tosi.', 'Tarkoittaako waiver myös nykyisen rikkomuksen poistamista, jolloin tila olisi Compliant?');
const eod = node('Ei waiveria → EoD', 'Kaksi peräkkäistä rikkomusta ilman waiveria: Event of Default.', 1400, 1370);
const remedies = node('EoD:n seuraamukset', 'Korjaus ≤ 30 pv · marginaali + ≤ 2,00 prosenttiyksikköä · eräännyttäminen.', 1400, 1730, 'Lähde luettelee cure≤30d, margin+≤2.00pp ja accelerate. Se ei kerro, ovatko nämä vaihtoehtoisia tai kumulatiivisia eikä missä järjestyksessä niitä käytetään.', 'Milloin korjausaika alkaa, ja estääkö korjaaminen marginaalikorotuksen tai eräännyttämisen?');
const links = [[start,breach,'Testiajankohta'],[breach,compliant,'Ei ylitystä'],[breach,twice,'Ylitys'],[twice,watch,'Ensimmäinen peräkkäinen'],[twice,waiver,'Toinen peräkkäinen'],[waiver,reset,'Kirjallinen waiver'],[waiver,eod,'Ei kirjallista waiveria'],[eod,remedies,'Lähteen seuraamusluettelo']];
const model = { revision: before.model.revision, nextNodeNumber: next, title: 'NetDebt / EBITDA — 3,50-kovenantti', entry: start, nodes, edges: links.map(([source,target,label],i) => ({ id: `COV_${i+1}`, source,target,label })) };
const result = await api('/api/model', { model, expectedRevision: before.model.revision });
await api('/api/selection', { id: null });
const verified = await api('/api/state');
if (verified.model.nodes.length !== nodes.length || verified.model.entry !== start) throw new Error('Verification failed');
console.log(JSON.stringify({ title: verified.model.title, revision: verified.model.revision, nodes: nodes.length, sources: refs.length, sourceText: excerpts.fragments.map(f=>f.text) }));
