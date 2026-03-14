import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  addEdge,
  Connection,
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
  useReactFlow,
  OnConnectStart,
  OnConnectEnd,
  EdgeProps,
  EdgeLabelRenderer,
  getBezierPath,
  BaseEdge,
} from "reactflow";
import "reactflow/dist/style.css";
import type { GraphNode, GraphEdge } from "../types";

type GraphEditorProps = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  onGraphChange?: (nodes: GraphNode[], edges: GraphEdge[]) => void;
};

const NODE_WIDTH = 260;
const CHILD_Y_OFFSET = 160;

function DeletableEdge(props: EdgeProps) {
  const { setEdges } = useReactFlow();
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <button
              type="button"
              className="edge-delete-btn"
              onClick={() => setEdges((es) => es.filter((e) => e.id !== id))}
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { deletable: DeletableEdge };

function createNodeLabel(
  nodeId: string,
  name: string,
  description: string[],
  onDelete: (id: string) => void,
  onEdit: (id: string) => void,
  onAddChild: (id: string) => void,
) {
  return (
    <div className="graph-node">
      <div className="graph-node-header">
        <div className="graph-node-title">{name}</div>
        <div className="graph-node-actions">
          <button
            type="button"
            className="graph-node-action-btn graph-node-action-btn--add"
            title="Add child node"
            onClick={(e) => { e.stopPropagation(); onAddChild(nodeId); }}
          >
            +
          </button>
          <button
            type="button"
            className="graph-node-action-btn"
            onClick={(e) => { e.stopPropagation(); onEdit(nodeId); }}
          >
            ✎
          </button>
          <button
            type="button"
            className="graph-node-action-btn graph-node-action-btn--danger"
            onClick={(e) => { e.stopPropagation(); onDelete(nodeId); }}
          >
            ×
          </button>
        </div>
      </div>
      {Array.isArray(description) && description.length > 0 && (
        <ul className="graph-node-list">
          {description.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toReactFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "deletable",
  }));
}

function GraphEditorInner({ initialNodes, initialEdges, onGraphChange }: GraphEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const { project } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const connectingNodeId = useRef<string | null>(null);
  const idCounterRef = useRef(0);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  function handleEditNode(nodeId: string) {
    const node = nodes.find((n) => n.id === nodeId);
    const meta = node?.data?.meta as { name?: string; description?: string[] } | undefined;
    const init = initialNodes.find((n) => n.id === nodeId);
    setEditingNodeId(nodeId);
    setDraftName(meta?.name ?? init?.name ?? "");
    setDraftDescription((meta?.description ?? init?.description ?? []).join("\n"));
  }

  function handleDeleteNode(nodeId: string) {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }

  function handleAddChild(sourceId: string) {
    const source = nodes.find((n) => n.id === sourceId);
    const sourcePos = source?.position ?? { x: 0, y: 0 };

    const newId = `new_${Date.now()}_${idCounterRef.current++}`;
    const newName = "New Step";
    const newDescription: string[] = [];
    const newPosition = { x: sourcePos.x, y: sourcePos.y + CHILD_Y_OFFSET };

    setNodes((ns) => [
      ...ns,
      {
        id: newId,
        position: newPosition,
        data: {
          meta: { name: newName, description: newDescription },
          label: createNodeLabel(newId, newName, newDescription, handleDeleteNode, handleEditNode, handleAddChild),
        },
        style: { width: NODE_WIDTH },
      },
    ]);
    setEdges((es) => [
      ...es,
      { id: `e_${sourceId}_${newId}`, source: sourceId, target: newId, type: "deletable" },
    ]);
  }

  function handleSaveEdit() {
    if (!editingNodeId) return;
    const name = draftName.trim() || "Untitled";
    const description = draftDescription
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== editingNodeId) return node;
        const meta = { name, description };
        return {
          ...node,
          data: {
            ...node.data,
            meta,
            label: createNodeLabel(node.id, name, description, handleDeleteNode, handleEditNode, handleAddChild),
          },
        };
      }),
    );
    setEditingNodeId(null);
  }

  function handleCancelEdit() {
    setEditingNodeId(null);
  }

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: "deletable" }, eds));
    },
    [setEdges],
  );

  const onConnectStart: OnConnectStart = useCallback((_, { nodeId }) => {
    connectingNodeId.current = nodeId;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const sourceId = connectingNodeId.current;
      connectingNodeId.current = null;
      if (!sourceId) return;

      const mouseEvent = event as MouseEvent;
      const target = mouseEvent.target as Element;
      if (!target.classList.contains("react-flow__pane")) return;

      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const { left, top } = wrapper.getBoundingClientRect();
      const position = project({ x: mouseEvent.clientX - left, y: mouseEvent.clientY - top });

      const newId = `new_${Date.now()}_${idCounterRef.current++}`;
      const newName = "New Step";
      const newDescription: string[] = [];

      setNodes((ns) => [
        ...ns,
        {
          id: newId,
          position,
          data: {
            meta: { name: newName, description: newDescription },
            label: createNodeLabel(newId, newName, newDescription, handleDeleteNode, handleEditNode, handleAddChild),
          },
          style: { width: NODE_WIDTH },
        },
      ]);
      setEdges((es) => [
        ...es,
        { id: `e_${sourceId}_${newId}`, source: sourceId, target: newId, type: "deletable" },
      ]);
    },
    [project, setNodes, setEdges],
  );

  // Notify parent of graph changes
  useEffect(() => {
    if (!onGraphChange) return;
    const graphNodes: GraphNode[] = nodes.map((n) => ({
      id: n.id,
      name: (n.data?.meta as { name?: string })?.name ?? n.id,
      description: (n.data?.meta as { description?: string[] })?.description ?? [],
      position: n.position,
    }));
    const graphEdges: GraphEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));
    onGraphChange(graphNodes, graphEdges);
  }, [nodes, edges, onGraphChange]);

  // Sync edges when prop changes
  useEffect(() => {
    setEdges(toReactFlowEdges(initialEdges));
  }, [initialEdges, setEdges]);

  // Sync nodes when prop changes
  useEffect(() => {
    setNodes(
      initialNodes.map((node) => {
        const desc = Array.isArray(node.description) ? node.description : [];
        return {
          id: node.id,
          position: node.position,
          data: {
            meta: { name: node.name, description: desc },
            label: createNodeLabel(node.id, node.name, desc, handleDeleteNode, handleEditNode, handleAddChild),
          },
          style: { width: NODE_WIDTH },
        };
      }),
    );
  }, [initialNodes, setNodes]);

  return (
    <div className="graph-editor">
      <div className="graph-header">
        <div className="graph-header-text">
          <h2>Graph</h2>
          <p className="graph-caption">
            Drag from a node handle to connect or create a new step. Click an edge to delete it.
          </p>
        </div>
      </div>

      {editingNodeId && (
        <div className="graph-edit-panel">
          <div className="graph-edit-row">
            <label className="graph-edit-label" htmlFor="node-name-input">
              Name
            </label>
            <input
              id="node-name-input"
              className="graph-edit-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </div>
          <div className="graph-edit-row">
            <label className="graph-edit-label" htmlFor="node-desc-input">
              Description (one line per item)
            </label>
            <textarea
              id="node-desc-input"
              className="graph-edit-textarea"
              rows={4}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
            />
          </div>
          <div className="graph-edit-actions">
            <button
              type="button"
              className="graph-edit-button graph-edit-button--primary"
              onClick={handleSaveEdit}
            >
              Save
            </button>
            <button type="button" className="graph-edit-button" onClick={handleCancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div ref={wrapperRef} className="graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function GraphEditor(props: GraphEditorProps) {
  return (
    <ReactFlowProvider>
      <GraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}
