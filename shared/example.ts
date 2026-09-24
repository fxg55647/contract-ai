import { emptyModel, type ContractModel, type ContractNode } from "./model";

// Deliberately illustrative: the UI labels this as an example, never as an agreed contract.
export function exampleModel(): ContractModel {
  const nodes: ContractNode[] = [
    {
      id: "N1",
      title: "Toimitus sovittuna päivänä",
      text: "Toimittaja toimittaa sovittuun päivään mennessä. Toimituspäivä ja hyväksymiskriteerit ovat vielä avoinna.",
      open: true,
      sourceRefs: [],
      position: { x: 350, y: 0 },
    },
    {
      id: "N2",
      title: "Toimitus valmis",
      text: "Toimituksen aikatauluehto täyttyy.",
      open: false,
      sourceRefs: [],
      position: { x: 0, y: 290 },
    },
    {
      id: "N3",
      title: "Ilmoitus viivästyksestä",
      text: "Asiakas ilmoittaa viivästyksestä kirjallisesti. Ilmoituksen vastaanottaja ja tiedoksiantotapa ovat vielä avoinna.",
      open: true,
      sourceRefs: [],
      position: { x: 550, y: 290 },
    },
    {
      id: "N4",
      title: "Aika korjata viivästys",
      text: "Toimittaja saa mahdollisuuden korjata viivästyksen. Korjausajan pituus ja alkamishetki ovat vielä avoinna.",
      open: true,
      sourceRefs: [],
      position: { x: 550, y: 580 },
    },
    {
      id: "N5",
      title: "Korjausajan päättyminen",
      text: "Tarkistetaan, onko toimitus tehty korjausajan kuluessa.",
      open: false,
      sourceRefs: [],
      position: { x: 550, y: 870 },
    },
    {
      id: "N6",
      title: "Seurauksesta sovittava",
      text: "Korjaamatta jääneen viivästyksen seuraus on avoin. Esimerkki ei oleta automaattista purkuoikeutta tai korvausta.",
      open: true,
      sourceRefs: [],
      position: { x: 550, y: 1160 },
    },
  ];
  return {
    ...emptyModel(),
    title: "Toimitus ja viivästyksen korjaaminen · esimerkki",
    nextNodeNumber: 7,
    entry: "N1",
    nodes,
    edges: [
      { id: "E1", source: "N1", target: "N2", label: "Toimitettu ajallaan" },
      { id: "E2", source: "N1", target: "N3", label: "Toimitus viivästyy" },
      { id: "E3", source: "N3", target: "N4", label: "Ilmoituksen jälkeen" },
      { id: "E4", source: "N4", target: "N5", label: "Korjausaika päättyy" },
      { id: "E5", source: "N5", target: "N2", label: "Toimitus tehty" },
      { id: "E6", source: "N5", target: "N6", label: "Toimitus tekemättä" },
    ],
  };
}
