import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeProps,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import type { SourceDocument } from "../../shared/sources";
import {
  type ContractModel,
  type ContractNode,
  type Operation,
} from "../../shared/model";
import {
  separateBoxes,
  type Point,
  type Box,
} from "../../shared/layout";


type NodeData = {
  quotes: string[];
  node: ContractNode;
  entry: boolean;
  compact: boolean;
  changed: boolean;
  muted: boolean;
  readOnly: boolean;
  openSources: (id: string) => void;
};
const ContractCard = memo(function ContractCard({
  data,
  selected,
}: NodeProps<NodeData>) {
  const n = data.node;
  return (
    <div
      className={`contract-node ${data.entry ? "is-entry" : ""} ${data.compact ? "is-compact" : ""} ${selected ? "is-selected" : ""} ${data.changed ? "is-changed" : ""} ${data.muted ? "is-muted" : ""}`}
    >
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].flatMap(side =>
        (["target", "source"] as const).map(type => (
          <Handle
            key={`${type}-${side}`}
            id={`${type}-${side}`}
            type={type}
            position={side}
            isConnectable={false}
            style={{
              opacity: 0,
              pointerEvents: "none",
              [side]: -28,
              ...((side === Position.Top || side === Position.Bottom)
                ? { left: type === "target" ? "35%" : "65%" }
                : { top: type === "target" ? "35%" : "65%" }),
            }}
          />
        )),
      )}
      <div className="node-top">
        <span className="node-id">{n.id}</span>
        {data.entry && <span className="entry-tag">▶ ALKU</span>}
      </div>
      <h3>{n.title}</h3>
      <p className="node-summary">
        {n.text || "Kuvaa tähän, mitä tässä vaiheessa tapahtuu."}
      </p>
      {data.quotes.map((quote, index) => (
        <blockquote className="node-source-quote" key={index}>{quote}</blockquote>
      ))}
      {n.sourceRefs.length > 0 && (
        <button
          type="button"
          className="node-sources nodrag nopan"
          title="Näytä sanatarkat lainaukset alkuperäisestä sopimuksesta"
          aria-label={`${n.sourceRefs.length} ${n.sourceRefs.length === 1 ? "alkuperäinen lähdekohta" : "alkuperäistä lähdekohtaa"} nodessa ${n.id}`}
          onClick={(event) => {
            event.stopPropagation();
            data.openSources(n.id);
          }}
        >
          <span aria-hidden="true">▤</span>
          {n.sourceRefs.length} {n.sourceRefs.length === 1 ? "alkuperäinen kohta" : "alkuperäistä kohtaa"}
          <span className="node-sources-arrow" aria-hidden="true">→</span>
        </button>
      )}
      {n.open && (
        <div className="node-bottom">
          <span className="status status-open">Avoin</span>
        </div>
      )}
    </div>
  );
});
const nodeTypes = { contract: ContractCard };
type Props = {
  sourceDocuments: SourceDocument[];
  model: ContractModel;
  selected: string | null;
  changed: string[];
  compact: boolean;
  readOnly: boolean;
  path: string[];
  fitToken: number;
  onSelect: (id: string | null) => void;
  onEdge: (id: string) => void;
  onChange: (
    operations: Operation[],
    summary: string,
    revision?: number,
  ) => Promise<boolean>;
};
function Canvas(props: Props) {
  const { model, onChange, onSelect } = props;
  const { fitView, fitBounds, setCenter } =
    useReactFlow();
  const contentBounds = useRef({ x: 0, y: 0, width: 1, height: 1 });
  const toView = (position: { x: number; y: number }) =>
    props.compact ? { x: position.y, y: position.x * 0.6 } : position;
  const toModel = (position: { x: number; y: number }) =>
    props.compact ? { x: position.y / 0.6, y: position.x } : position;
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [sizes, setSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const boxes = useMemo(
    () =>
      separateBoxes(
        model.nodes.map((n) => ({
          id: n.id,
          ...toView(n.position),
          width: props.compact ? 230 : 290,
          height:
            sizes[`${props.compact}:${n.id}`]?.height ??
            (props.compact ? 220 : 310),
        })),
        props.compact,
      ),
    [model.revision, props.compact, sizes],
  );
  const boxMap = new Map(boxes.map((b) => [b.id, b]));
  function movedPosition(id: string, position: Point) {
    const original = model.nodes.find((n) => n.id === id)!;
    const drawn = boxMap.get(id)!;
    const delta = toModel({ x: position.x - drawn.x, y: position.y - drawn.y });
    return {
      x: original.position.x + delta.x,
      y: original.position.y + delta.y,
    };
  }
  const dragRevision = useRef(model.revision);
  function mappedNodes(): Node<NodeData>[] {
    const pathSet = new Set(props.path);
    return model.nodes.map((n) => ({
      id: n.id,
      type: "contract",
      position: { x: boxMap.get(n.id)!.x, y: boxMap.get(n.id)!.y },
      style: { width: props.compact ? 230 : 290 },
      ariaLabel: `${n.id}: ${n.title}`,
      selected: n.id === props.selected,
      data: {
        node: n,
        quotes: n.sourceRefs.flatMap(ref => {
          const fragment = props.sourceDocuments.find(d => d.id === ref.documentId)?.fragments.find(f => f.id === ref.fragmentId);
          return fragment ? [ref.quote ?? fragment.text] : [];
        }),
        entry: n.id === model.entry,
        compact: props.compact,
        changed: props.changed.includes(n.id),
        muted: props.path.length > 0 && !pathSet.has(n.id),
        readOnly: props.readOnly,
        openSources: onSelect,
      },
    }));
  }
  useEffect(() => {
    setNodes(mappedNodes());
  }, [
    model.revision,
    props.selected,
    props.compact,
    props.readOnly,
    props.changed.join(","),
    props.path.join(","),
    boxes,
  ]);
  const hasNodes = model.nodes.length > 0;
  useEffect(() => {
    if (hasNodes) {
      const timer = setTimeout(
        () =>
          void fitBounds(contentBounds.current, {
            padding: 0.18,
            duration: 300,
          }),
        100,
      );
      return () => clearTimeout(timer);
    }
  }, [hasNodes, props.fitToken, props.compact, fitBounds]);
  useEffect(() => {
    const n = boxes.find((n) => n.id === props.selected);
    if (n)
      void setCenter(n.x + n.width / 2, n.y + n.height / 2, {
        zoom: 1,
        duration: 300,
      });
  }, [props.selected, props.compact, setCenter]);
  useEffect(() => {
    const current = props.path.at(-1);
    if (!current) return;
    const next = model.edges
      .filter((e) => e.source === current)
      .map((e) => e.target);
    const timer = setTimeout(
      () =>
        void fitView({
          nodes: [current, ...next].map((id) => ({ id })),
          padding: 0.35,
          minZoom: 0.7,
          maxZoom: 1.1,
          duration: 350,
        }),
      120,
    );
    return () => clearTimeout(timer);
  }, [props.path.join(","), props.compact, fitView]);
  const edges: Edge[] = model.edges.map(({ label, ...edge }) => {
    const source = boxMap.get(edge.source)!;
    const target = boxMap.get(edge.target)!;
    const dx = target.x + target.width / 2 - source.x - source.width / 2;
    const dy = target.y + target.height / 2 - source.y - source.height / 2;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const sourceSide = horizontal
      ? (dx >= 0 ? Position.Right : Position.Left)
      : (dy >= 0 ? Position.Bottom : Position.Top);
    const targetSide = horizontal
      ? (dx >= 0 ? Position.Left : Position.Right)
      : (dy >= 0 ? Position.Top : Position.Bottom);
    return ({
    ...edge,
    type: "smoothstep",
    sourceHandle: `source-${sourceSide}`,
    targetHandle: `target-${targetSide}`,
    ariaLabel: `Yhteys ${edge.source} → ${edge.target}${label ? `: ${label}` : ""}`,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#859589", width: 30, height: 30 },
    // Both tips follow the path direction: away from source, into target.
    markerStart: { type: MarkerType.ArrowClosed, color: "#859589", orient: "auto", width: 30, height: 30 },
    style: { stroke: "#859589", strokeWidth: 1.6 },
  });
  });
  const allBoxes = boxes;
  if (allBoxes.length) {
    const x = Math.min(...allBoxes.map((b) => b.x));
    const y = Math.min(...allBoxes.map((b) => b.y));
    contentBounds.current = {
      x,
      y,
      width: Math.max(...allBoxes.map((b) => b.x + b.width)) - x,
      height: Math.max(...allBoxes.map((b) => b.y + b.height)) - y,
    };
  }
  return (
    <div
      className="canvas-interaction"
      onKeyDownCapture={(event) => {
        const element = event.target as HTMLElement;
        if (!element.classList.contains("react-flow__node")) return;
        const id = element.dataset.id;
        const node = model.nodes.find((n) => n.id === id);
        if (!node) return;
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onSelect(event.key === "Escape" ? null : node.id);
          return;
        }
        const directions: Record<string, [number, number]> = {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        };
        const direction = directions[event.key];
        if (!direction || props.readOnly || props.selected !== node.id) return;
        event.preventDefault();
        event.stopPropagation();
        const amount = event.shiftKey ? 20 : 5;
        void onChange(
          [
            {
              type: "update_node",
              id: node.id,
              changes: {
                position: movedPosition(node.id, {
                  x: boxMap.get(node.id)!.x + direction[0] * amount,
                  y: boxMap.get(node.id)!.y + direction[1] * amount,
                }),
              },
            },
          ],
          `${node.id} siirretty näppäimistöllä`,
        );
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        minZoom={0.02}
        maxZoom={1.8}
        nodesDraggable={!props.readOnly}
        nodesConnectable={false}
        deleteKeyCode={null}
        onNodesChange={(changes) => {
          const dimensions = changes.filter((c) => c.type === "dimensions");
          if (dimensions.length)
            setSizes((previous) => {
              const next = { ...previous };
              let changed = false;
              for (const c of dimensions)
                if (c.type === "dimensions" && c.dimensions) {
                  const key = `${props.compact}:${c.id}`;
                  if (
                    next[key]?.height !== c.dimensions.height ||
                    next[key]?.width !== c.dimensions.width
                  ) {
                    next[key] = c.dimensions;
                    changed = true;
                  }
                }
              return changed ? next : previous;
            });
          setNodes((ns) =>
            applyNodeChanges(
              changes.filter((c) => c.type !== "remove"),
              ns,
            ),
          );
        }}
        onNodeDragStart={() => {
          dragRevision.current = model.revision;
        }}
        onNodeDragStop={async (_, _node, dragged) => {
          const operations = dragged.flatMap((n) => {
            const position = movedPosition(n.id, n.position);
            const previous = model.nodes.find((candidate) => candidate.id === n.id)!.position;
            return Math.abs(position.x - previous.x) < 0.01 && Math.abs(position.y - previous.y) < 0.01
              ? []
              : [{
                  type: "update_node" as const,
                  id: n.id,
                  changes: { position },
                }];
          });
          if (!operations.length) return;
          const ok = await onChange(
            operations,
            "Vaiheiden sijaintia muutettu",
            dragRevision.current,
          );
          if (!ok) setNodes(mappedNodes());
        }}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        onEdgeClick={(_, edge) => props.onEdge(edge.id)}
        fitView
        attributionPosition="bottom-left"
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="#cbd4c8"
          gap={24}
          size={1}
        />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
export function ContractCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
