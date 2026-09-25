# Semantic Logic Mapper

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

Sovellus on visuaalisen mallin työtila. Keskustele ChatGPT:ssä
ja anna sille MCP-työkalut käyttöön. Muitakin standardia MCP:tä tukevia asiakkaita
voi kokeilla; niiden ohjeiden noudattaminen ja tiedostokäsittely on testattava erikseen.
Sovellus ei tee mallipalvelukutsuja eikä kysy AI-API-avainta.

Ulkoisen dokumentin visualisointi alkaa aina avaamalla alkuperäinen tiedosto
Microsoft Wordissa tai LibreOffice Writerissa. Avustaja lukee avoimen dokumentin
elävän dokumenttiyhteyden kautta. Koko lähdetekstiä tai lähdetiedostoa ei kopioida
contract-editoriin. Työtilaan rekisteröidään vain kartan nodeissa käytetyt
sanatarkat katkelmat ja niiden vakaat paikantimet.

MCP antaa avustajalle työjärjestyksen: varmista avoin Word/Writer-dokumentti,
lue ja analysoi se siellä, rekisteröi käytetyt lähdekatkelmat,
mallinna ehdot ja seuraukset, liitä lähdeviitteet ja raportoi kattavuus.
Skeemavalidointi tarkistaa viitteiden olemassaolon, ei tulkinnan oikeellisuutta.

Selaimen **Avaa karttatiedosto** ja **Tallenna karttatiedosto** käsittelevät
Sopimuskartan omaa DOCX-pakettia, eivät avoinna olevaa lähdesopimusta. Diagrammin
muokattava rakenne, käytetyt lähdekatkelmat paikantimineen ja tekstiluonnos
kulkevat paketin dataosassa. Alkuperäinen sopimusteksti tallennetaan edelleen
Wordissa tai Writerissa. Käyttöliittymän **Ohje**-painike näyttää tämän
tallennusjaon milloin tahansa.

Yksi karttatiedosto voi sisältää enintään 100 erillistä mappia. **Mapit**-paneeli
listaa niiden nimet ja laatikkomäärät sekä antaa avata, luoda ja poistaa mappeja
yksitellen. Vanha yhden mapin karttatiedosto avautuu automaattisesti yhden mapin
luettelona. Mapin poistaminen ei muuta Word/Writer-lähdedokumenttia.

## Ulkoisen tekoälyn MCP-yhteys

> **Pikaohje:** koko Codex–LibreOffice–Nelson–contract-editor-ketjun
> käynnistys, asetukset, terveystarkistukset ja vianrajaus löytyvät oppaasta
> [MCP-opas: Codex, LibreOffice ja contract-editor](docs/mcp-libreoffice-operations.md).
> Kun palvelut ovat käynnissä, tarkista ne komennolla `npm run mcp:check`.

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
- **Esitysnäkymä** piilottaa keskustelun ja muokkaustoiminnot. Jaa selainikkuna
  tavallisen kokoustyökalun ruudunjaolla. Sovellus ei luo julkista jakolinkkiä.
- **Avaa karttatiedosto / Tallenna karttatiedosto** käsittelee Sopimuskartan
  DOCX-pakettia, jonka mukana diagrammi ja käytetyt lähdekatkelmat kulkevat.
  Painikkeet eivät avaa tai tallenna Word/Writer-lähdesopimusta.
- **Ohje** näyttää visualisoinnin aloituksen ja tallennuksen työnjaon.
- **Mapit** näyttää kaikki karttatiedoston visualisoinnit ja mahdollistaa niiden
  avaamisen, luonnin ja yksittäisen poistamisen.
- Tekstiluonnoksen tuottaa ulkoinen avustaja save_draft-työkalulla ja näyttää varoituksen, kun rakenne on muuttunut
  sen muodostamisen jälkeen. Mallivastaus näytetään tekstinä, ei suoritettavana HTML:nä.

## Tallennus ja rajaus

Työtila palautuu paikallisesti `.contract-data/workspace.json`-tiedostosta.
Käyttäjälle siirrettävä tiedosto on DOCX. Paikallinen palautumistiedosto sisältää
aktiivisen kartan, käytetyt lähdekatkelmat, tekstiluonnoksen ja kumoamishistorian eikä
ole salattu. `CONTRACT_DATA_FILE` vaihtaa sen sijainnin.
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
## Lähdetyökalut

- register_live_source_excerpts: rekisteröi avoimesta Word/Writer-dokumentista
  vain kartassa siteeratut sanatarkat katkelmat ja vakaat paikantimet.
- list_source_documents: luettele rekisteröidyt lähdekatkelmakokonaisuudet.
- read_source_fragments: lue työtilaan talletetut siteeratut katkelmat. Koko
  lähdedokumentti luetaan aina Word/Writer-yhteydestä.
- save_draft: tallenna avustajan laatima luonnos nykyiseen malliversioon.

Mappeja hallitaan MCP-työkaluilla `create_map`, `select_map` ja `delete_map`.
`get_workspace` kertoo aktiivisen mapin ja kaikkien mappien tiiviin luettelon.
`delete_map`-työkalua käytetään vain käyttäjän nimenomaisesta pyynnöstä.

Esimerkkipyyntö: ”Lue Writerissa avoinna oleva sopimus, muodosta lähteistetty
toimintakartta ja kerro, mitä jäi mallintamatta. Tallenna Sopimuskarttaan vain
käytetyt sanatarkat katkelmat ja niiden paikantimet.”
