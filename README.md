# Sopimuskartta / contract-ai

Keskustele sopimuksesta, tee sen toimintalogiikka näkyväksi ja tarkentakaa sitä
yhdessä. Juristi voi muokata rakennetta käsin tai ohjata sitä ulkoisella
tekoälyllä MCP:n kautta. Selkokieliset kuvaukset ja esitysnäkymä on tarkoitettu
myös muille sopimuksen osapuolille.

## Käynnistys

Node.js 22 tai uudempi.

```sh
npm ci
npm run dev
```

Avaa **http://127.0.0.1:5173**. Komento käynnistää sekä selaimen kehityspalvelimen
että paikallisen työtilapalvelimen (portti 4317). Sovelluksen käyttö ei tarvitse tekoälyn API-avainta.

Tuotantobuildin voi ajaa paikallisesti näin:

```sh
npm run build
npm start
```

Avaa tällöin **http://127.0.0.1:4317**.

## ChatGPT-vetoinen työskentely

Sovellus on lähdeaineiston ja visuaalisen mallin työtila. Keskustele ChatGPT:ssä
ja anna sille MCP-työkalut käyttöön. Muitakin standardia MCP:tä tukevia asiakkaita
voi kokeilla; niiden ohjeiden noudattaminen ja tiedostokäsittely on testattava erikseen.
Sovellus ei tee mallipalvelukutsuja eikä kysy AI-API-avainta.

Liitä teksti sovelluksen Lähdeaineisto-paneeliin tai pyydä avustajaa käyttämään
import_source_document-työkalua. Tuonti säilyttää tekstin ja pilkkoo sen ohjelmallisesti.
Enimmäiskoko on 60 000 merkkiä dokumenttia kohti. Tiedoston liittäminen avustajaan
ei automaattisesti siirrä sitä tähän työtilaan: avustajan on tuotava sen koko teksti.
PDF/Word-tiedostojen tekstin poiminta jää asiakkaalle; tarkista poiminnan kattavuus.

MCP antaa avustajalle työjärjestyksen: tuo lähde, lue kaikki katkelmasivut,
mallinna ehdot ja seuraukset, liitä lähdeviitteet ja raportoi kattavuus.
Skeemavalidointi tarkistaa viitteiden olemassaolon, ei tulkinnan oikeellisuutta.

Tuo JSON hyväksyy vanhan graafin tai version 1 contract-map-paketin.
Vie JSON sisältää graafin ja alkuperäiset lähdetekstit, ei keskustelua tai tunnuksia.
Tuonti korvaa graafin; sen voi kumota. Aiemmat ja tuodut lähteet säilyvät
muuttumattomina myös kumottaessa. Tunnisteet sovitetaan tuonnissa työtilaan.
Paketti sisältää sopimustekstin ja sitä on käsiteltävä sen mukaisesti.

## Ulkoisen tekoälyn MCP-yhteys

Palvelin toteuttaa standardin **stdio MCP** -rajapinnan. Käynnistä ensin
`npm run dev` tai `npm start`. Lisää sitten MCP-asiakkaaseen seuraava palvelin
(vaihda absoluuttiset polut omaan ympäristöösi):

```json
{
  "mcpServers": {
    "sopimuskartta": {
      "command": "node",
      "args": [
        "C:/projects/contract-editor/node_modules/tsx/dist/cli.mjs",
        "C:/projects/contract-editor/server/mcp.ts"
      ]
    }
  }
}
```

Asiakkaan asetusten tarkka paikka vaihtelee. Jos Node ei ole asiakkaan PATHissa,
käytä myös `command`-kentässä absoluuttista polkua. `npm run mcp` on tarkoitettu
stdio-asiakkaan käynnistettäväksi, ei selaimen korvaajaksi. Konfiguraation
suora node-komento välttää npm:n ylimääräiset stdout-viestit.

`CONTRACT_SERVER_URL` vaihtaa yhteisen työtilapalvelimen osoitteen; oletus on
`http://127.0.0.1:4317`. MCP-prosessi ei ylläpidä omaa erillistä graafia.

| Työkalu          | Toiminta                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `get_workspace`  | Nykyinen malli, versio, seuraava vapaa N-tunniste, valittu node, keskustelu ja muutokset |
| `apply_changes`  | Tarkistettu atominen muutos versionumeron perusteella                                    |
| `focus_node`     | Valitse node myös selaimessa                                                             |
| `validate_model` | Tarkista rakenteelliset puutteet                                                         |
| `undo_change`    | Kumoa viimeisin yhteisen mallin muutos                                                   |

Lisäksi resurssi `contract://workspace` palauttaa työtilan. Esimerkkipyyntö:

> Lue sopimuskartta. Muuta N4:n korjausaika alkamaan kirjallisen ilmoituksen
> vastaanottamisesta. Älä muuta muita ehtoja. Korosta sen jälkeen N4.

Ulkoinen keskustelu pysyy MCP-asiakkaassa; mallimuutokset ja niiden yhteenvedot
näkyvät selaimessa. MCP-yhteys ei edellytä AI-avainta sovelluksessa. ChatGPT-verkkopalveluun yhdistäminen on erillinen käyttöönotto: tämä repo tarjoaa paikallisen stdio-palvelimen, ei valmista ChatGPT-yhteyttä.

## Yhteinen läpikäynti

- Valitse node avataksesi sen tarkat ehdot, lähdeselitteen ja avoimen kysymyksen.
- Muokkaa nodea sivupaneelissa. Lisää seuraava vaihe plus-painikkeella tai
  vedä kahvasta tyhjään tilaan. Yläkahvasta syntyy edeltävä vaihe.
- Klikkaa yhteyttä muokataksesi sen ehtoa tai poistaaksesi sen.
- Kumoaminen/palauttaminen koskee yhteistä mallia, myös MCP-muutoksia.
- **Käy polku läpi** korostaa valitsemasi haarat. Se ei suorita ehtojen
  laskentaa eikä päätä puolestasi, mikä haara juridisesti soveltuu.
- **Esitysnäkymä** piilottaa keskustelun ja muokkaustoiminnot. Jaa selainikkuna
  tavallisen kokoustyökalun ruudunjaolla. Sovellus ei luo julkista jakolinkkiä.
- **Vie JSON / Tuo JSON** tallentaa tai palauttaa sopimusmallin. Tuonti voidaan
  kumota. Lähdedokumentit sisältyvät vientiin; keskustelu ja tunnukset eivät.
- Tekstiluonnoksen tuottaa ulkoinen avustaja save_draft-työkalulla ja näyttää varoituksen, kun rakenne on muuttunut
  sen muodostamisen jälkeen. Mallivastaus näytetään tekstinä, ei suoritettavana HTML:nä.

## Tallennus ja rajaus

Työtila tallentuu `.contract-data/workspace.json`-tiedostoon. Hakemisto on
gitignoressa. Tiedosto sisältää sopimusmallin, keskustelun, tekstiluonnoksen ja
kumoamishistorian; se ei ole salattu. `CONTRACT_DATA_FILE` vaihtaa sijainnin.
Palvelin kuuntelee vain paikallista loopback-osoitetta ja torjuu vieraan
alkuperän selainpyynnöt. Tämä on yksi paikallinen työtila, ei julkinen
monen käyttäjän pilvipalvelu.

## Tarkistukset

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Selainkokeet käyttävät Playwrightia. Jos Chromium puuttuu, asenna se komennolla
`npx playwright install chromium`. Testit eivät tarvitse maksullista API-avainta.

[Arkkitehtuuri, mallin merkitys ja rajat](docs/architecture.md).
## Lähde- ja siirtotyökalut

- import_source_document: tallenna alkuperäinen teksti ja palauta dokumentin tunniste.
- list_source_documents: luettele dokumentit ja katkelmien määrät.
- read_source_fragments: lue katkelmat erissä; jatka nextOffset-arvolla kunnes null.
- export_model: palauta koko siirtopaketti. Avustajan tiedostotyökalut tekevät ladattavan tiedoston.
- import_model: validoi ja tuo siirtopaketti nykyisen revision perusteella.
- save_draft: tallenna avustajan laatima luonnos nykyiseen malliversioon.

Esimerkkipyyntö: ”Tuo tämä sopimus muuttumattomaksi lähteeksi. Lue kaikki katkelmat,
muodosta lähteistetty toimintakartta ja kerro, mitä jäi mallintamatta.”
