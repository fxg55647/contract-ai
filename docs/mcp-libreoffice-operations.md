# MCP-opas: Codex, LibreOffice ja contract-editor

Tämä on operointi- ja vianrajausohje koko paikalliselle ketjulle. Aloita aina
luvusta **60 sekunnin pika-aloitus**. Muut luvut ovat asennusta, turvallista
työskentelyä ja poikkeustilanteita varten.

## Kokonaisuus yhdellä silmäyksellä

```text
Codex tai muu MCP-asiakas
├─ contract-editor (stdio MCP, server/mcp.ts)
│  └─ HTTP http://127.0.0.1:4317
│     ├─ yhteinen sopimuskartta ja vain siinä siteeratut lähdekatkelmat
│     └─ selain http://127.0.0.1:5173 kehitystilassa
└─ nelson (streamable HTTP MCP)
   └─ http://127.0.0.1:8766/mcp
      └─ avoin LibreOffice Writer -dokumentti
```

Yhteydet ovat tarkoituksella erilliset:

- `contract-editor` muokkaa rakenteista sopimusmallia, viitteitä ja työtilan
  valintaa. Se säilyttää vain kartassa käytetyt sanatarkat katkelmat ja niiden
  paikantimet, ei koko lähdedokumenttia.
- Yksi karttatiedosto voi sisältää useita mappeja. `get_workspace` palauttaa
  mapit ja aktiivisen mapin; `create_map`, `select_map` ja `delete_map` hallitsevat
  niitä. Poisto tehdään vain käyttäjän nimenomaisesta pyynnöstä.
- `nelson` lukee ja muokkaa juuri LibreOfficessa avoinna olevaa dokumenttia.
- Writerin tekstimuutos ei automaattisesti päivitä sopimuskarttaa. Pyydä
  muutoksen jälkeen agenttia tarkistamaan kartta ja sen lähdeviitteet uudelleen.

Kaikki palvelut kuuntelevat paikallista loopback-osoitetta. Contract-editor ei
ole julkinen monen käyttäjän palvelu eikä tarvitse AI-API-avainta.

## 60 sekunnin pika-aloitus

1. Avaa LibreOffice Writer ja haluttu DOCX. Varmista, että Nelson-laajennus on
   käynnissä.
2. Käynnistä projektin juuresta:

   ```powershell
   npm run dev
   ```

3. Tarkista toisessa päätteessä:

   ```powershell
   npm run mcp:check
   codex mcp list
   ```

4. Avaa tarvittaessa uusi Codex-tehtävä, jotta istunnon alussa ladattava
   MCP-työkalulista päivittyy.
5. Pyydä ensin vain lukuoperaatio:

   > Listaa avoimet LibreOffice-dokumentit ja lue contract-työtilan nykyinen
   > revisio. Älä muuta mitään.

Onnistuneessa tilanteessa `npm run mcp:check` näyttää sekä contract-palvelimen
työtilan että Nelsonin version, työkalumäärän ja avoimet dokumentit.

## Ensiasennus

### Projektin riippuvuudet

Vaatimus on Node.js 22 tai uudempi.

```powershell
npm ci
```

### Codexin MCP-konfiguraatio

Codex CLI:n ja IDE-laajennuksen MCP-konfiguraatio on yhteinen. Tarkista nykyinen
tila komennolla:

```powershell
codex mcp list
```

Lisää contract-editor absoluuttisilla poluilla. Muuta polku, jos repo sijaitsee
muualla:

```powershell
codex mcp add contract-editor -- node C:/projects/contract-editor/node_modules/tsx/dist/cli.mjs C:/projects/contract-editor/server/mcp.ts
```

Lisää LibreOfficen Nelson-palvelin:

```powershell
codex mcp add nelson --url http://127.0.0.1:8766/mcp
```

Vastaava `~/.codex/config.toml`-rakenne on:

```toml
[mcp_servers.contract-editor]
command = "node"
args = [
  "C:/projects/contract-editor/node_modules/tsx/dist/cli.mjs",
  "C:/projects/contract-editor/server/mcp.ts",
]

[mcp_servers.nelson]
url = "http://127.0.0.1:8766/mcp"
```

Jos Node ei ole MCP-asiakkaan `PATH`-ympäristömuuttujassa, käytä `command`-
kentässä `node.exe`:n absoluuttista polkua. Contract MCP:n voi osoittaa eri
HTTP-palvelimeen ympäristömuuttujalla `CONTRACT_SERVER_URL`; oletus on
`http://127.0.0.1:4317`.

Konfiguraation muuttamisen jälkeen käynnistä uusi Codex-istunto, jos uudet
työkalut eivät näy. Pelkkä konfiguraatiorivi ei todista, että taustapalvelu
vastaa; aja aina `npm run mcp:check`.

### LibreOffice ja Nelson

Nelson toimii LibreOfficen sisällä ja tarjoaa MCP-päätepisteen portissa 8766.
Asennus ja päivitys tehdään Nelson-projektin omien ohjeiden mukaan:

- <https://github.com/quazardous/nelson-mcp>

Tämän repon terveystarkistus ei asenna eikä päivitä LibreOffice-laajennusta. Se
ainoastaan alustaa MCP-istunnon, listaa työkalut ja kutsuu lukevan
`doc_list_open`-työkalun.

## Normaali työskentely

### Sopimuskartan muuttaminen

Turvallinen järjestys on:

1. `get_workspace`
2. lue tarvittaessa nykyisissä viitteissä käytetyt katkelmat
   `read_source_fragments`-kutsuilla; älä tulkitse niitä koko lähdedokumentiksi
3. jos muutos perustuu lähdetekstiin, lue oikea kohta avoimesta Writer-
   dokumentista ja rekisteröi vain käytettävät sitaatit sekä paikantimet
   `register_live_source_excerpts`-työkalulla
4. pieni kohdennettu `apply_changes`, jossa `expectedRevision` on juuri luettu
   revisio
5. `validate_model`
6. tarvittaessa `focus_node`, jotta sama kohta näkyy selaimessa
7. uusi `get_workspace`, jolla tulos varmistetaan

Älä arvaa seuraavaa node-tunnistetta: käytä työtilan `nextNodeNumber`-arvoa.
Älä poista ja rakenna vanhoja nodeja uudelleen pelkän tekstimuutoksen vuoksi.
Säilytä lähdeviitteet ja kerro epävarmoista tai mallintamattomista kohdista.

### LibreOffice Writerin muuttaminen

Turvallinen järjestys on:

1. `doc_list_open`
2. valitse oikea dokumentti; älä oleta aktiivisen ikkunan olevan oikea
3. `nav_outline`
4. käytä otsikoiden vakaita kirjanmerkkejä, älä hauraita kappalenumeroita
5. ennen suurta muutosta `doc_save_as`
6. tee rajattu muutos
7. lue muutettu alue uudelleen ja tarkista Writerin näkyvä tulos
8. tallenna vain käyttäjän pyynnön ja sovitun työnkulun mukaisesti

Nelson muokkaa elävää dokumenttia: muutos näkyy heti LibreOfficessa, eikä sillä
ole erillistä commit-vaihetta. `doc_undo` voi auttaa saman avoimen istunnon
aikana, mutta kumoushistoria ei säily dokumentin sulkemisen yli.

### Muutos, joka koskee molempia puolia

Tee ensin lähteeseen perustuva rakenteinen muutos contract-editorissa, tarkista
se, ja muokkaa sen jälkeen Writerin tekstiä. Lopuksi varmista erikseen:

- contract-editorin revisio, nodet, yhteydet ja lähdeviitteet
- Writerin oikea dokumentti, otsikko ja muuttunut tekstialue
- tallennuksen jälkeen DOCX:n avautuminen uudelleen
- ilmoittaako editori ulkoisesta tekstimuutoksesta

Älä koskaan kuvaa näitä kahta kirjoitusta yhdeksi atomiseksi operaatioksi. Jos
toinen onnistuu ja toinen epäonnistuu, raportoi osittainen tila täsmällisesti.

## Hyviä pyyntöjä agentille

Pelkkä terveystarkistus:

> Tarkista contract-editorin ja LibreOfficen MCP-yhteydet. Listaa avoimet
> dokumentit ja contract-työtilan revisio. Älä muuta mitään.

Rajattu karttamuutos:

> Lue nykyinen työtila. Muuta vain N4:n korjausajan alkamiskohta kirjallisen
> ilmoituksen vastaanottamiseen, säilytä tunnisteet ja lähdeviitteet, validoi
> malli ja korosta N4. Älä muuta Writer-dokumenttia.

Sama muutos molempiin:

> Tee muutos ensin contract-editoriin nykyisellä revisiolla. Varmista tulos.
> Etsi sen jälkeen sama kohta avoimesta Writer-dokumentista otsikkorakenteen
> avulla, tallenna ennen suurta muutosta kopio ja päivitä teksti. Lue molemmat
> kohdat lopuksi uudelleen ja raportoi mahdollinen osittainen epäonnistuminen.

Uuden lähdedokumentin visualisointi:

> Varmista ensin, että sopimus on avoinna Writerissa. Lue koko tarvittava sisältö
> elävästä Writer-yhteydestä, rakenna lähteistetty kartta ja luettele kohdat,
> joita et pystynyt mallintamaan varmasti. Rekisteröi contract-editoriin vain
> nodeissa käytetyt sanatarkat katkelmat ja niiden vakaat paikantimet; älä kopioi
> koko lähdetekstiä työtilaan.

## Terveystarkistukset käsin

### Contract HTTP

```powershell
Invoke-RestMethod http://127.0.0.1:4317/api/state
```

Tavallisia onnistumisen merkkejä ovat `model.revision`, `document.fileName` ja
`sourceDocuments`. `sourceDocuments` sisältää nykyisessä työnkulussa vain
siteeratut katkelmat ja niiden paikantimet. HTTP-yhteyden toimiminen ei yksin todista stdio MCP:n
toimintaa; integraatiotestin voi ajaa näin:

```powershell
node --import tsx --test --test-concurrency=1 --test-name-pattern="real MCP stdio client" tests/mcp.test.ts
```

Testi käyttää erillistä hetkellistä työtilaa eikä muuta käyttäjän aktiivista
sopimuskarttaa.

### Nelson MCP

Nopea suositus on aina:

```powershell
npm run mcp:check
```

Raaka GET-pyyntö Nelsonin `/mcp`-osoitteeseen voi palauttaa esimerkiksi 406,
vaikka palvelin toimii, koska MCP vaatii oikeat `Accept`-otsakkeet ja JSON-RPC-
alustuksen. Älä diagnosoi yhteyttä rikkoutuneeksi pelkän selaimen GET-pyynnön
perusteella.

## Vianrajaus

| Oire | Todennäköinen syy | Korjaus |
| --- | --- | --- |
| Contract-palvelin ei vastaa portissa 4317 | `npm run dev` tai `npm start` ei ole käynnissä | Käynnistä palvelin projektin juuresta ja aja tarkistus uudelleen |
| `contract-editor` näkyy listassa, mutta kutsu epäonnistuu | MCP-prosessi toimii, mutta HTTP-tausta ei vastaa | Tarkista `/api/state` ja `CONTRACT_SERVER_URL` |
| `nelson` näkyy listassa, mutta yhteys ei avaudu | LibreOffice tai Nelson-laajennus ei ole käynnissä | Käynnistä LibreOffice ja laajennus; tarkista portti 8766 |
| Nelson vastaa, mutta työkaluja puuttuu | Aktiivinen dokumenttityyppi on väärä | Avaa tai aktivoi oikea Writer-dokumentti ja listaa työkalut uudelleen |
| `doc_list_open` palauttaa tyhjän listan | Writerissa ei ole avointa dokumenttia | Avaa haluttu DOCX LibreOfficessa |
| Codex ei näytä juuri lisättyä MCP:tä | Istunto latasi työkalut ennen konfiguraatiomuutosta | Avaa uusi Codex-tehtävä tai käynnistä paikallinen asiakas uudelleen |
| `expectedRevision`-ristiriita | Ihminen tai toinen asiakas muutti työtilaa | Lue `get_workspace` uudelleen ja muodosta muutos tuoreen tilan päälle |
| DOCX avautuu, mutta kartta ei vastaa tekstiä | Writerin teksti muuttui ilman kartan päivitystä | Tarkista varoitus, lähdeviitteet ja malli käsin; älä synkronoi sokkona |
| Nelson ilmoittaa vanhentuneesta istunnosta | LibreOffice tai laajennus käynnistyi uudelleen | Alusta uusi MCP-istunto; vanhaa session ID:tä ei voi käyttää |

## Turvallisuus ja tietojen säilyminen

- Molemmat päätepisteet on tarkoitettu vain paikalliseen käyttöön.
- `.contract-data/workspace.json` on palautumistiedosto, ei salattu tietovarasto.
- Älä lisää sopimustekstiä, tunnuksia tai muita luottamuksellisia tietoja
  lokeihin, komentoriviparametreihin tai Git-historiaan.
- Contract-editor hylkää makroja sisältävät DOCX-tiedostot ja rajoittaa paketin
  kokoa sekä osamäärää.
- Sopimuskartan **Tallenna karttatiedosto** tuottaa erillisen DOCX-paketin.
  Kartta ja siteeratut katkelmat tallennetaan sen Custom XML -osaan. Tämä ei
  tallenna eikä korvaa Wordissa/Writerissa avoinna olevaa alkuperäistä sopimusta.
- Alkuperäinen sopimusteksti tallennetaan Wordissa tai Writerissa niiden omalla
  tallennustoiminnolla. Sovelluksen **Ohje**-painikkeesta työnjaon voi tarkistaa.
- Suuria tai vaikeasti palautettavia Writer-muutoksia ei tehdä ilman kopiota.

## Kehittäjän tarkistuslista

Kun MCP-, DOCX- tai palvelinkoodia muutetaan:

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run mcp:check
```

Lisäksi tee oikea karttatiedoston tallennuskierros:

1. editori → DOCX
2. avaa karttatiedosto LibreOfficessa, tee pieni näkyvän dokumenttiosan muutos ja tallenna
3. avaa DOCX editorissa
4. varmista, että kartta, siteeratut lähdekatkelmat ja tunnisteet säilyivät
5. varmista, että ulkoinen tekstimuutos havaittiin

## Lisälukeminen

- [README](../README.md)
- [Arkkitehtuuri](architecture.md)
- [DOCX-toteutussuunnitelma](docx-toteutussuunnitelma.md)
- [OpenAI: Docs MCP ja Codexin MCP-konfiguraation perusteet](https://developers.openai.com/learn/docs-mcp)
- [Nelson MCP](https://github.com/quazardous/nelson-mcp)
