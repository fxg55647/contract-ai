export type GraphNode = {
  id: string;
  name: string;
  description: string[];
  position: {
    x: number;
    y: number;
  };
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
};
