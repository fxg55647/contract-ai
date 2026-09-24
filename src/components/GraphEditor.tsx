import { useEffect, useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType, MiniMap, Position, useNodesState, type Edge, type Node, type NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import type { ContractModel, ContractNode } from '../../shared/model';

type Props = {
  model: ContractModel;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: { x: number; y: number }) => void;
};

function ContractCard({ data, selected }: NodeProps<ContractNode>) {
  return (
    <div className={`contract-card ${selected ? 'is-selected' : ''}`}>
      <div className="node-meta"><span>{data.id}</span>{data.open && <span className="status status-open">Avoin</span>}</div>
      <strong>{data.title}</strong>
      {data.text && <p>{data.text}</p>}
    </div>
  );
}

const nodeTypes = { contract: ContractCard };

export function GraphEditor({ model, selected, onSelect, onMove }: Props) {
  const mappedNodes = useMemo<Node<ContractNode>[]>(() => model.nodes.map(node => ({
    id: node.id,
    type: 'contract',
    position: node.position,
    data: node,
    selected: node.id === selected,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  })), [model.nodes, selected]);
  const [nodes, setNodes, onNodesChange] = useNodesState(mappedNodes);
  useEffect(() => setNodes(mappedNodes), [mappedNodes, setNodes]);

  const edges = useMemo<Edge[]>(() => model.edges.map(edge => ({
    ...edge,
    type: 'smoothstep',
    label: edge.label,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6b746d' },
    style: { stroke: '#879087', strokeWidth: 1.5 },
    labelStyle: { fill: '#4d584f', fontSize: 12, fontWeight: 600 },
    labelBgStyle: { fill: '#f5f3ed', fillOpacity: 0.94 },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
  })), [model.edges]);

  return (
    <div className="graph-canvas">
      {nodes.length === 0 && (
        <div className="graph-empty">
          <div className="tree-symbol">⌘</div>
          <h2>Puusi kasvaa tähän</h2>
          <p>Liitä vasemmalle sopimusteksti tai kuvaile ehto ja valitse <strong>Visualisoi puuksi</strong>.</p>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={1.6}
        onPaneClick={() => onSelect(null)}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDragStop={(_, node) => onMove(node.id, node.position)}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="#d8d5ca" gap={24} size={1} />
        <MiniMap pannable zoomable nodeColor="#dce8df" maskColor="rgba(247, 246, 241, .72)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
