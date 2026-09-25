# Agentin pikaohje: contract-editor + LibreOffice

Kun tehtävä koskee MCP:tä, LibreOfficea, Writeria, DOCX-tiedostoa tai sopimuskarttaa,
lue ensin [docs/mcp-libreoffice-operations.md](docs/mcp-libreoffice-operations.md).

## Työjärjestys

1. Varmista yhteydet komennolla `npm run mcp:check`.
2. Contract-editorin HTTP-palvelimen pitää vastata osoitteessa
   `http://127.0.0.1:4317` ja MCP-palvelimen olla konfiguroitu nimellä
   `contract-editor`.
3. LibreOfficen Nelson-laajennuksen pitää vastata osoitteessa
   `http://127.0.0.1:8766/mcp` ja MCP-palvelimen olla konfiguroitu nimellä
   `nelson`.
4. Lue ennen contract-editorin muutosta `get_workspace` ja käytä sen revisiota
   `apply_changes`-kutsun `expectedRevision`-arvona.
5. Kun pyyntö koskee ulkoisen dokumentin visualisointia, pyydä käyttäjää ensin
   avaamaan tiedosto Wordissa tai Writerissa. Älä aloita ennen kuin elävä
   dokumenttiyhteys pystyy lukemaan sen.
6. Lue ennen Writer-muutosta `doc_list_open`. Writerissa lue lisäksi
   `nav_outline` ja käytä vakaita kirjanmerkkejä otsikoiden paikantamiseen.
7. Tarkista muutoksen jälkeen molemmat puolet erikseen. Writerin teksti ja
   contract-editorin rakenteinen malli eivät synkronoidu automaattisesti.
8. Lue `get_workspace`-vastauksen `maps` ja `activeMapId`. Uusi erillinen
   visualisointi tehdään `create_map`-työkalulla; olemassa olevaa mappia ei
   korvata vahingossa. Poista mappi vain käyttäjän nimenomaisesta pyynnöstä.

## Rajat

- Yhdistä suoraviivainen tekeminen yhteen laatikkoon. Erillinen laatikko on
  haarautuminen, päätepiste tai toiston tarvitsema paluukohta. Älä käytä lähteen
  kappalejakoa, toimijan vaihtumista tai funktiokutsua laatikkojaon perusteena.
  Säilytä yhdistettäessä järjestys, ehdot ja kaikki lähdeviitteet.

- Älä oleta, että keskusteluun liitetty tiedosto on contract-palvelimen
  käytettävissä. Lue lähde avoimesta Word/Writer-istunnosta. Älä tuo koko
  lähdetekstiä contract-editoriin; rekisteröi `register_live_source_excerpts`-
  työkalulla vain kartassa käytetyt sanatarkat katkelmat ja vakaat paikantimet.
- Älä korvaa koko sopimuskarttaa pienen muutoksen vuoksi. Säilytä tunnisteet,
  sijainnit, lähdeviitteet ja muut käyttäjän tekemät muutokset.
- Älä väitä yhteyden toimivan pelkän konfiguraation perusteella. Varmista se
  terveystarkistuksella tai oikealla, ensisijaisesti vain lukevalla MCP-kutsulla.
- Ota suuresta Writer-muutoksesta kopio `doc_save_as`-työkalulla ennen muutosta.
- Uusi tai muuttunut MCP-konfiguraatio voi vaatia uuden Codex-istunnon ennen
  kuin työkalut näkyvät natiivissa työkalulistassa.
