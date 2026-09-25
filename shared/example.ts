import { emptyModel, type ContractModel, type ContractNode } from "./model";

// Deliberately illustrative: the UI labels this as an example, never as an agreed contract.
export function exampleModel(): ContractModel {
  const nodes: ContractNode[] = [
    {
      id: "N1",
      title: "Delivery on agreed date",
      text: "The supplier delivers by the agreed date. The delivery date and acceptance criteria are still unresolved.",
      open: true,
      sourceRefs: [],
      position: { x: 350, y: 0 },
    },
    {
      id: "N2",
      title: "Delivery complete",
      text: "The delivery timing requirement is satisfied.",
      open: false,
      sourceRefs: [],
      position: { x: 0, y: 290 },
    },
    {
      id: "N3",
      title: "Notice of delay",
      text: "The customer gives written notice of the delay. The recipient and delivery method are still unresolved.",
      open: true,
      sourceRefs: [],
      position: { x: 550, y: 290 },
    },
    {
      id: "N4",
      title: "Time to remedy",
      text: "The supplier receives an opportunity to remedy the delay. The duration and starting point of the remedy period are still unresolved.",
      open: true,
      sourceRefs: [],
      position: { x: 550, y: 580 },
    },
    {
      id: "N5",
      title: "Remedy period ends",
      text: "Check whether delivery was completed during the remedy period.",
      open: false,
      sourceRefs: [],
      position: { x: 550, y: 870 },
    },
    {
      id: "N6",
      title: "Consequence unresolved",
      text: "The consequence of an unremedied delay is unresolved. This example does not assume an automatic termination or compensation right.",
      open: true,
      sourceRefs: [],
      position: { x: 550, y: 1160 },
    },
  ];
  return {
    ...emptyModel(),
    title: "Delivery and delay remedy · example",
    nextNodeNumber: 7,
    entry: "N1",
    nodes,
    edges: [
      { id: "E1", source: "N1", target: "N2", label: "Delivered on time" },
      { id: "E2", source: "N1", target: "N3", label: "Delivery is delayed" },
      { id: "E3", source: "N3", target: "N4", label: "After notice" },
      { id: "E4", source: "N4", target: "N5", label: "Remedy period ends" },
      { id: "E5", source: "N5", target: "N2", label: "Delivery completed" },
      { id: "E6", source: "N5", target: "N6", label: "Delivery incomplete" },
    ],
  };
}
