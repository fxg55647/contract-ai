# Diagrammit DOCX-dokumentin mukana

Päiväys: 24.9.2026. Tämä on toteutussuunnitelma; DOCX-tallennusta ei ole vielä toteutettu.

## Tavoite ja rajaus

Käyttäjä avaa ja tallentaa yhden DOCX-tiedoston. Sopimustekstiä voi muokata
Wordissa ja LibreOfficessa, ja diagrammien muokattava rakenne kulkee saman
tiedoston sisällä. Editorissa dokumentin avaaminen palauttaa rakenteen,
sijainnit, lähdeaineiston ja viitteet. Diagrammeja ei muuteta kuviksi eikä
niitä tarvitse näyttää tekstinkäsittelyohjelmassa. Erillisiä JSON-tiedostoja
ei tarvita käyttäjän työnkulussa.

Ensimmäinen toteutus säilyttää nykyisen yhden sopimusmallin per dokumentti.
Usean erillisen kartan käyttöliittymä on erillinen laajennus. JSON voi edelleen
olla sisäinen tietoesitys ja API-muoto; sen poistaminen kaikkialta ei ole tavoite.
Vanhoja tiedostomuotoja tai työtiloja ei tarvitse tukea eikä migroida.

## 1. Varmista säilyminen ennen lopullisen formaatin valintaa

Ensisijainen kokeiltava ratkaisu on DOCX:n oma Custom XML Part: sovelluksen
omassa XML-nimiavaruudessa oleva versioitu tietosisältö, jonka sisällä
diagrammidata voidaan esittää XML-tekstiksi escapettuna JSONina. Paketille
luodaan asianmukaiset sisältötyypit ja relaatiot. Pelkkää irrallista JSON-entryä
ZIP-pakettiin ei valita ilman säilyvyysnäyttöä.

Microsoft dokumentoi [Custom XML Partien lisäämisen dokumenttiin](https://learn.microsoft.com/en-us/visualstudio/vsto/how-to-add-custom-xml-parts-to-documents-by-using-vsto-add-ins?view=visualstudio).
Tämä ei vielä osoita säilymistä LibreOfficessa. Kyse on erillisestä dataosasta,
ei dokumenttitekstin vanhasta inline custom XML -merkinnästä.

Tee pieni koedokumentti, jossa on muotoiltua tekstiä, taulukko, otsakkeet ja
diagrammidata. Aja seuraavat kierrokset ja kirjaa ohjelmien tarkat versiot:

- Editori → Word: avaa, muokkaa tekstiä, tallenna DOCX → editori.
- Editori → LibreOffice: avaa, muokkaa tekstiä, tallenna DOCX → editori.
- Editori → Word → LibreOffice → editori, sekä päinvastainen järjestys.
- Toista tallennus useasti ja kokeile Tallenna nimellä -toimintoa.

Hyväksy ratkaisu vasta kun kaikki node- ja nuolitiedot, sijainnit, lähdetekstit,
lainaukset ja tunnisteet palautuvat semanttisesti samoina ja dokumentin teksti
sekä muotoilut säilyvät. XML-tiedostonimi tai ZIP-tavujen järjestys voi muuttua.
Jos Custom XML Part ei säily, kokeile standardin mukaista upotettua dataobjektia
samalla testimatriisilla. Älä julkaise kahden ohjelman tukea ilman näyttöä;
jos kumpikaan mekanismi ei täytä tavoitetta, ratkaise tallennustapa erikseen
ennen varsinaista integraatiota. Ei automaattista paluuta erillisiin JSONeihin.

## 2. Määrittele dokumentin sisältö ja elinkaari

Lisää `shared/document.ts`: tiukka nykyformaatin skeema, dokumentin pysyvä
tunniste, formaattiversio, sopimusmalli, lähdedokumentit, tekstiluonnos ja sen
malliversio sekä dokumenttitekstin vertailutiiviste. Tallenna lähdeviitteiden
tarvitsema kokonaisuus, ei pelkkiä graafin laatikoita. Keskustelut, tunnukset,
API-avaimet, valinta ja kumoamispino eivät kuulu siirrettävään dokumenttiin.

Uusi dokumentti muodostaa tavallisen DOCX-tekstiosan tekstiluonnoksesta;
ilman luonnosta luodaan otsikko ja tyhjä tekstipohja. Tuodun DOCX:n alkuperäinen
paketti säilytetään. Diagrammien tallennus päivittää vain sovelluksen dataosan
ja sen välttämättömät relaatiot, ei rakenna koko dokumenttitekstiä uudelleen.
Luonnoksen vieminen näkyväksi tekstiksi on erillinen käyttäjän toiminto, jotta
ulkopuolella muokattua tekstiä ei korvata vahingossa.

Tavallinen DOCX ilman diagrammidataa avautuu uutena diagrammityötilana.
Vioittunut, moniselitteinen tai tuntematonta versiota oleva sovellusdata
hylätään selkeällä virheellä; sitä ei tulkita tyhjäksi kartaksi. Sovelluksen
merkintä dokumentin ominaisuuksissa auttaa tunnistamaan kadonneen dataosan,
mutta jos ulkoinen ohjelma poistaa kaikki merkinnät, katoamista ei voi varmasti
erottaa tavallisesta DOCX-tiedostosta. Säilyvyystestit ovat siksi julkaisuehto.

Wordissa tai LibreOfficessa muuttunut teksti ei automaattisesti muuta diagrammia
eikä alkuperäisiä lähdekatkelmia. Tekstisisällön muutoksesta näytetään
"Dokumentin teksti on muuttunut – tarkista diagrammi ja lähdeviitteet".
Pelkkä ZIP- tai muotoilumuutos ei saa laukaista tekstimuutosilmoitusta.

## 3. Toteuta palvelin ja käyttöliittymä

- Lisää `server/docx.ts`: paketin luku, validointi, dataosan haku nimiavaruudella,
  uuden dokumentin luonti ja olemassa olevan paketin rajattu päivitys.
  Valitse ZIP/XML-kirjastot vaiheen 1 kokeen perusteella.
- Rajoita pakattu ja purettu koko sekä osien määrä. Estä polkujen läpikäynti
  ja XML:n ulkoiset entiteetit; älä nouda dokumentin ulkoisia relaatioita.
  Hylkää salatut ja makroja sisältävät tiedostot tässä ensimmäisessä versiossa.
- Lisää HTTP-rajapintaan binäärinen avaus ja DOCX-lataus. Avaus validoi kaiken
  ennen tilan vaihtamista ja tarkistaa `expectedRevision`-arvon.
  Lataus muodostetaan yhdestä johdonmukaisesta tilannekuvasta.
- Dokumentin avaus vaihtaa koko dokumenttikontekstin atomisesti: malli,
  lähteet, luonnos ja säilytettävä DOCX-paketti. Nollaa vanhan dokumentin
  valinta ja kumoamishistoria. Älä yhdistä vanhan työtilan lähteitä uuteen.
- Paikallinen automaattitallennus saa jäädä sisäiseksi palautumistiedostoksi.
  Sen pitää sisältää myös aktiivisen DOCX-paketin palauttamiseen tarvittavat
  tiedot atomisesti. Käyttäjän dokumentti on silti yksi DOCX; sisäinen JSON
  ei ole siirtomuoto eikä käyttäjän käsiteltävä tiedosto.
- Korvaa `src/App.tsx`:n Tuo JSON / Vie JSON toiminnoilla Avaa dokumentti /
  Tallenna dokumentti. Näytä tiedostonimi ja tallentamattomat muutokset.
  Lataus merkitsee vain vietynä olleen revision tallennetuksi; latauksen
  aikana syntyneet muutokset säilyvät tallentamattomina. Selaimessa tallennus
  tarkoittaa aluksi DOCX-latausta, ei lupausta alkuperäisen tiedoston ylikirjoituksesta.
- Päivitä MCP:n tuonti/vienti dokumenttitoiminnoiksi, jotka käyttävät samaa
  palvelinpalvelua. Siirrä tiedosto palvelimen hallitulla tiedostotunnisteella;
  älä työnnä koko ZIP/base64-pakettia mallin keskusteluun. Nykyiset mallin
  luku- ja muutostyökalut säilyvät rakenteisena rajapintana.

## 4. Poista taaksepäin yhteensopivuus

Nykyisestä koodista tunnistetut kohteet:

- `shared/model.ts`: poista `modelSchema.nodes`-kentän `z.preprocess`, joka
  poistaa `kind`-kentän ja muuntaa `name/actor/summary/details/question/status`
  kentät nykyiseen `title/text/open`-muotoon. Validoi suoraan `nodeSchema`lla.
- `src/App.tsx`: poista vanhan raakagraafin ja `contract-map`-paketin välillä
  valitseva JSON-tuonti ja molempien tiedostomuotojen käyttöliittymätuki.
- `shared/package.ts`, `server/store.ts`, `server/http.ts` ja `server/mcp.ts`:
  poista korvautuvan contract-map v1 -siirtomuodon tuonti/vienti. Erota
  esimerkkimallin lataus vanhasta `/api/import`-tiedostotuonnista; päivitä
  myös sitä käyttävät skriptit ja testit.
- `server/store.ts`: poista vain vanhojen tallenteiden lukemista varten
  lisätyt oletusarvot/muunnokset. Uuden mallin järkevät oletusarvot ja
  lähdeviitteiden deduplikointi eivät automaattisesti ole legacy-tukea.
  Uusi sisäinen tallenne validoidaan tiukasti; vanha tiedosto antaa selvän
  virheen eikä ylikirjoitu hiljaisesti. Ei migraattoria.
- `tests/model.test.ts`: korvaa legacy-muunnoksen testi vanhan rakenteen
  hylkäämistestillä. Korvaa JSON-siirtotestit DOCX-testeillä.
- Tarkista käyttämättömät `GraphEditor.tsx`, `ChatPanel.tsx`,
  `ConversationPanel.tsx`, `SourcesPanel.tsx` ja `server/ai.ts` viitehaulla;
  poista todetut käyttämättömät prototyyppiosat ja niiden tyylit/riippuvuudet.
  Tämä on siivousta, ei edellytys DOCX-formaatille.
- Arvioi `claude-api-key`-localStorage-siivous erikseen: se poistaa vanhaa
  tunnistetietoa eikä tarjoa formaattiyhteensopivuutta. Älä säilytä muuta
  vanhaa avainten käsittelyä sen varjolla.
- Päivitä README, arkkitehtuurikuvaus ja MCP-ohjeet vastaamaan lopputulosta.

Vanhoja paikallisia käyttäjätiedostoja ei poisteta osana koodisiivousta.
Formaattiversio säilyy virheiden tunnistamiseen; se ei tarkoita lupausta
vanhojen versioiden tuesta. Wordin ja LibreOfficen välinen toimivuus säilyy
nimenomaisena vaatimuksena, vaikka oman sovelluksen legacy-tuki poistetaan.

## 5. Testit ja toteutusjärjestys

Lähtötilan tarkistus 24.9.2026: 18/18 palvelin- ja mallitestiä läpäisee ja
tuotantobuild onnistuu. Nykyiset selainkokeet eivät ole vihreitä: osa etsii
jo poistuneita käyttöliittymäelementtejä, kuten Yleiskuva, Käy polku läpi ja
Aloita tyhjästä. Päivitä testit nykyisiin toimintoihin ja selvitä muut
epäonnistumiset ennen DOCX-integraatiota, jotta regressiot voidaan erottaa
lähtötilan puutteista. Testejä ei korjata tässä suunnittelumuutoksessa.

1. Säilyvyyskoe ja ohjelmaversioilla dokumentoitu päätös dataosan muodosta.
2. Nykyformaatin skeema ja DOCX-koodekki. Yksikkötestit: koko sisällön
   edestakainen tallennus, puuttuva/viallinen/uudempi data, ZIP/XML-rajat.
3. Dokumentin elinkaari ja HTTP/MCP. Testaa vanhentunut revisio, epäonnistuvan
   avauksen atomisuus, lähdeviitteet ja prosessin uudelleenkäynnistyksestä palautuminen.
4. Käyttöliittymä. Selainkoe: avaa DOCX, muokkaa diagrammia, lataa DOCX,
   avaa ladattu tiedosto ja varmista rakenne sekä sijainnit.
5. Legacy-poistot, käyttämättömän koodin siivous ja dokumentaation päivitys.
6. Aja `npm test`, `npm run build`, `npm run test:e2e` sekä vaiheen 1
   oikeiden tekstinkäsittelyohjelmien tallennuskierrokset lopullisella toteutuksella.

Julkaisun hyväksymisehto: yhden DOCX:n siirtäminen tyhjään editoriympäristöön
palauttaa diagrammin ja lähteet ilman erillisiä JSON-tiedostoja myös kummankin
tekstinkäsittelyohjelman kautta tallentamisen jälkeen. Diagrammit eivät näy
kuvina eikä tekstin ulkoinen muokkaus muuta diagrammia huomaamatta.
