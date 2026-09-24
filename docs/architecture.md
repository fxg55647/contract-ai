# Sopimuskartta: keskustelu, sopimusmalli ja yhteinen näkymä

Toteutus muuttaa prototyypin kertaluonteisesta graafin generoinnista yhteisen,
versioidun sopimusmallin muokkaukseksi. Juristi käyttää työkalua, mutta kartan
nimet, kuvaukset ja esitysnäkymä palvelevat myös muita sopimuksen osapuolia.

## Tiedon kulku

Keskustelu tai ulkoinen MCP-asiakas → tarkistettu muutos → paikallinen työtila →
reaaliaikainen selainpäivitys. Graafin käsimuutokset kulkevat samaa reittiä.

- `shared/model.ts`: Zod-skeemat, atomiset muutokset, pysyvät N-tunnisteet,
  törmäyksiä välttävä sijoittelu ja rakenteelliset varoitukset.
- `shared/prompts.ts`: yhteinen mallinnusohje keskustelulle ja MCP-asiakkaalle.
- `server/store.ts`: työtila, versionumerot, levyltä palautuminen, 50 muutoksen
  kumous-/palautuspino ja 100 viimeisen muutoksen yhteenveto.
- `server/http.ts`: paikallinen API ja selainpäivitykset Server-Sent Eventsillä.
- `server/mcp.ts`: standardi stdio MCP-palvelin, joka käyttää samaa HTTP-APIa.
- `server/ai.ts`: vapaa keskustelu, eksplisiittinen graafipyyntö työkaluskeemalla
  ja erillinen tekstiluonnos. API-avain ei tallennu työtilaan.
- `src/components/ConversationPanel.tsx`, `ContractCanvas.tsx` ja `Inspector.tsx`:
  nykyinen käyttöliittymä. Samanaikaisen muokkauksen tuottamat vaihtoehtoiset
  `ChatPanel.tsx`- ja `GraphEditor.tsx`-tiedostot on säilytetty; App ei käytä niitä.

## Sopimusmallin merkitys

Node sisältää pysyvän tunnisteen, lyhyen nimen, toimijan, selkokielisen kuvauksen,
tarkat ehdot, tiedon alkuperän ja avoimen kysymyksen. Tyyppi on toiminta, ehto,
määräaika tai lopputulos. Tila on vahvistettu, ehdotus tai avoin. Nämä ovat
erillisiä ulottuvuuksia: myös laskettava ehto voi olla vielä ehdotus.

Nuoli kertoo suunnan ja sen tekstilabel kertoo siirtymisen ehdon. Rakenteellinen
validointi hylkää puuttuvat viittaukset, toistuvat tunnisteet/yhteydet,
itseensä palaavat nuolet ja virheelliset koordinaatit. Keskeneräiset haarat ja
saavuttamattomat nodet ovat näkyviä varoituksia, jotta käsin muokkaaminen on
mahdollista välivaiheineen. Usean noden syklit sallitaan toistuvien menettelyjen
kuvaamiseen. Sovellus ei väitä validoivansa juridista oikeellisuutta.

## Muutosten turvallisuus ja jäljitettävyys

Jokainen mallimuutos sisältää `expectedRevision`-kentän. Palvelin hyväksyy sen
vain, jos versio on edelleen sama. Toisen selainikkunan, MCP:n tai juristin
käsimuutos aiheuttaa vanhalle kirjoitukselle 409-virheen. Tekoälyvastaus ei
automaattisesti ohita tätä. Koko muutospaketti joko hyväksytään tai hylätään.

Muuttumattomat node-tunnisteet ja sijainnit säilyvät. Poisto poistaa myös
nodeen liittyvät nuolet. Aloitusnoden poistaminen valitsee ensimmäisen jäljelle
jäävän noden aluksi; käyttöliittymästä voi vaihtaa sen. Kumoaminen luo uuden
version, joten vanhaa versionumeroa ei käytetä uudelleen.

`source` on avustajan tai käyttäjän kirjoittama lähdeselite, ei itsenäisesti
varmennettu oikeuslähdeviittaus. Malli ei voi keksiä puuttuvia määräaikoja tai
seurauksia: ohje pyytää näyttämään ne avoimina kysymyksinä. Prompti ei yksin
takaa sisällön oikeellisuutta; juristi ja osapuolet tarkastavat luonnoksen.

## Rajat

- Yksi paikallinen työtila; ei käyttäjätunnuksia tai monen organisaation palvelua.
- Esitysnäkymän voi jakaa tavallisella kokoustyökalulla. Ei julkista jakolinkkiä.
- Yleiskuva näyttää vaiheet vaakasuunnassa ja tiivistää niiden tiedot. Näkymän
  koordinaatit muunnetaan takaisin malliin siirrettäessä; tallennettu rakenne
  tai käsin tehty asettelu ei muutu pelkän näkymänvaihdon vuoksi.
- Polun läpikäynti korostaa käyttäjän valitsemat haarat. Ei laskentamoottoria,
  automaattista oikeudellista simulointia tai luonnollisen kielen ehtojen suorittamista.
- JSON-vienti sisältää sopimusmallin, ei keskustelua, API-avaimia tai kumouspinoa.
- Tekstiluonnos näyttää lähdeversion ja ilmoittaa, jos malli on muuttunut sen jälkeen.
- MCP-asiakas liitetään erikseen. Ulkoisen asiakkaan oma keskustelu ei automaattisesti
  kopioidu sovelluksen chatiin; sen mallimuutokset näkyvät muutoshistoriassa.
- Keskustelu ja työtila tallentuvat paikalliseen JSON-tiedostoon ilman salausta.

## Testauksen painopiste

Mallin atomisuus, epäkelpo rakenne, tunnisteiden säilyminen, samanaikaiset
kirjoitukset, poiston siivous, kumoaminen ja tiedoston palautuminen testataan
ilman maksullista mallikutsua. HTTP ja MCP testataan oikeilla paikallisilla
yhteyksillä. Tekoälyn sisältölaatu tarvitsee erillisen arviointiaineiston:
kovenantti ja korjaus, toimitusviive, indeksitarkistus, maksujärjestys ja optio.
Kussakin tarkistetaan annettujen ehtojen säilyminen, avoimien asioiden näkyminen
sekä se, pystyvätkö myös muut kuin juristit selittämään eri polkujen seuraukset.
