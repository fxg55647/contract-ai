import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
  type Edge,
  type EdgeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import type { SourceDocument } from "../../shared/sources";
import { allocateEdgeLanes } from "../../shared/edge-lanes";
import {
  type ContractModel,
  type ContractNode,
  type Operation,
} from "../../shared/model";
import {
  separateBoxes,
  separateBoxesAroundObstacles,
  placeLabels,
  type Point,
  type Box,
  type OwnedBox,
} from "../../shared/layout";


type NodeData = {
  incoming: { id: string; side: Position; offset: number }[];
  ports: { id: string; side: Position; offset: number }[];
  quotes: string[];
  node: ContractNode;
  entry: boolean;
  compact: boolean;
  changed: boolean;
  muted: boolean;
  readOnly: boolean;
  openSources: (id: string) => void;
};
const EDGE_NODE_GAP = 10;
const ContractCard = memo(function ContractCard({
  data,
  selected,
}: NodeProps<NodeData>) {
  const n = data.node;
  const updateNodeInternals = useUpdateNodeInternals();
  const portKey = JSON.stringify([data.ports, data.incoming]);
  useEffect(() => { updateNodeInternals(n.id); }, [n.id, portKey, updateNodeInternals]);
  return (
    <div
      className={`contract-node ${data.entry ? "is-entry" : ""} ${data.compact ? "is-compact" : ""} ${selected ? "is-selected" : ""} ${data.changed ? "is-changed" : ""} ${data.muted ? "is-muted" : ""}`}
    >
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].flatMap(side =>
        (["target"] as const).map(type => (
          <Handle
            key={`${type}-${side}`}
            id={`${type}-${side}`}
            type={type}
            position={side}
            isConnectable={false}
            style={{
              opacity: 0,
              pointerEvents: "none",
              [side]: -EDGE_NODE_GAP,
              ...((side === Position.Top || side === Position.Bottom)
                ? { left: "50%" }
                : { top: "50%" }),
            }}
          />
        )),
      )}
      {data.ports.map(port => <Handle key={port.id} id={port.id} type="source"
        position={port.side} isConnectable={false} style={{ opacity: 0, pointerEvents: "none",
          [port.side]: -EDGE_NODE_GAP, ...([Position.Top, Position.Bottom].includes(port.side)
            ? { left: `${port.offset}%` } : { top: `${port.offset}%` }) }} />)}
      {data.incoming.map(port => <Handle key={port.id} id={port.id} type="target"
        position={port.side} isConnectable={false} style={{ opacity: 0, pointerEvents: "none",
          [port.side]: -EDGE_NODE_GAP, ...([Position.Top, Position.Bottom].includes(port.side)
            ? { left: `${port.offset}%` } : { top: `${port.offset}%` }) }} />)}
      <div className="node-top">
        <span className="node-id">{n.id}</span>
        {data.entry && <span className="entry-tag">▶ START</span>}
      </div>
      <h3>{n.title}</h3>
      <div className="node-content nopan" tabIndex={0}
        role="region" aria-label={`${n.id}: content and sources`}>
      <p className="node-summary">
        {n.text || "Describe what happens at this point."}
      </p>
      {data.quotes.map((quote, index) => (
        <blockquote className="node-source-quote" key={index}>{quote}</blockquote>
      ))}
      </div>
      {n.sourceRefs.length > 0 && (
        <button
          type="button"
          className="node-sources nodrag nopan"
          title="Show exact quotations from the original source"
          aria-label={`${n.sourceRefs.length} original source ${n.sourceRefs.length === 1 ? "excerpt" : "excerpts"} in box ${n.id}`}
          onClick={(event) => {
            event.stopPropagation();
            data.openSources(n.id);
          }}
        >
          <span aria-hidden="true">▤</span>
          {n.sourceRefs.length} source {n.sourceRefs.length === 1 ? "excerpt" : "excerpts"}
          <span className="node-sources-arrow" aria-hidden="true">→</span>
        </button>
      )}
      {n.open && (
        <div className="node-bottom">
          <span className="status status-open">Open</span>
        </div>
      )}
    </div>
  );
});
const nodeTypes = { contract: ContractCard };
function startArrowPoints(x: number, y: number, side: Position) {
  const tip = 16;
  const base = 1;
  const half = 8;
  if (side === Position.Right) return `${x + tip},${y} ${x + base},${y - half} ${x + base},${y + half}`;
  if (side === Position.Left) return `${x - tip},${y} ${x - base},${y - half} ${x - base},${y + half}`;
  if (side === Position.Bottom) return `${x},${y + tip} ${x - half},${y + base} ${x + half},${y + base}`;
  return `${x},${y - tip} ${x - half},${y - base} ${x + half},${y - base}`;
}
function ConditionEdge(props: EdgeProps) {
  const side = props.sourcePosition;
  const horizontal = side === Position.Right || side === Position.Left;
  const lane = props.data?.lane ?? 0;
  const [path] = getSmoothStepPath({ ...props, borderRadius: 12, offset: 24,
    ...(horizontal ? { centerX: (props.sourceX + props.targetX) / 2 + lane }
      : { centerY: (props.sourceY + props.targetY) / 2 + lane }) });
  const dx = side === Position.Right ? 12 : side === Position.Left ? -12 : 0;
  const dy = horizontal ? -8 : side === Position.Bottom ? 12 : -12;
  const anchor = side === Position.Right ? "translate(0, -100%)" : side === Position.Left
    ? "translate(-100%, -100%)" : side === Position.Top ? "translate(-50%, -100%)" : "translate(-50%, 0)";
  const labelBox = props.data?.labelBox as Box | undefined;
  return <>
    <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} interactionWidth={24} />
    <polygon
      className="edge-start-arrow"
      points={startArrowPoints(props.sourceX, props.sourceY, side)}
      fill={String(props.style?.stroke ?? "#46625a")}
      aria-hidden="true"
    />
    {props.label && <EdgeLabelRenderer><button className="edge-origin-label nodrag nopan"
      data-edge-id={props.id} title={String(props.label)} aria-label={`Condition: ${props.label}`}
      onClick={() => props.data?.onSelect(props.id)}
      style={{ color: props.style?.stroke, borderColor: props.style?.stroke,
        ...(labelBox
          ? { width: labelBox.width, transform: `translate(${labelBox.x}px, ${labelBox.y}px)` }
          : { transform: `translate(${props.sourceX + dx}px, ${props.sourceY + dy}px) ${anchor}` }) }}>
      {props.label}
    </button></EdgeLabelRenderer>}
  </>;
}
const edgeTypes = { condition: ConditionEdge };
// Non-semantic, red-free palette. Deterministic shuffle avoids flicker on redraw.
const branchColors = ["#2468b4", "#a65f00", "#7548b0", "#008579", "#202020", "#477522", "#9a8272", "#426093", "#5c449a", "#007b9c", "#28704e"];
function edgeHash(id: string) {
  return [...id].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
}
function routeEdges(edges: ContractModel["edges"], boxes: Box[]) {
  const boxMap = new Map(boxes.map(box => [box.id, box]));
  const routes = edges.map(edge => {
    const source = boxMap.get(edge.source)!;
    const target = boxMap.get(edge.target)!;
    const dx = target.x + target.width / 2 - source.x - source.width / 2;
    const dy = target.y + target.height / 2 - source.y - source.height / 2;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    return { ...edge, sourceSide: horizontal ? (dx >= 0 ? Position.Right : Position.Left)
      : (dy >= 0 ? Position.Bottom : Position.Top),
      targetSide: horizontal ? (dx >= 0 ? Position.Left : Position.Right)
      : (dy >= 0 ? Position.Top : Position.Bottom) };
  });
  // Incoming and outgoing connections share one port allocation. A reciprocal
  // pair consequently uses distinct ports at BOTH ends, not the same line twice.
  const portOffset = (nodeId: string, side: Position, edgeId: string) => {
    const incident = routes.filter(e => (e.source === nodeId && e.sourceSide === side) ||
      (e.target === nodeId && e.targetSide === side)).sort((a, b) => a.id.localeCompare(b.id));
    return (incident.findIndex(e => e.id === edgeId) + 1) / (incident.length + 1);
  };
  const withPorts = routes.map(edge => ({ ...edge,
    sourceOffset: portOffset(edge.source, edge.sourceSide, edge.id),
    targetOffset: portOffset(edge.target, edge.targetSide, edge.id),
  }));
  const lanes = allocateEdgeLanes(withPorts.map(edge => {
    const start = edgePoint(boxMap.get(edge.source)!, edge.sourceSide, edge.sourceOffset);
    const end = edgePoint(boxMap.get(edge.target)!, edge.targetSide, edge.targetOffset);
    const horizontal = [Position.Left, Position.Right].includes(edge.sourceSide);
    return { id: edge.id, horizontal, center: horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2,
      from: horizontal ? start.y : start.x, to: horizontal ? end.y : end.x };
  }));
  return withPorts.map(edge => ({ ...edge, lane: lanes.get(edge.id)! }));
}
function labelZones(routes: ReturnType<typeof routeEdges>, boxes: Box[]) {
  const boxMap = new Map(boxes.map(box => [box.id, box]));
  return routes.flatMap(edge => {
    if (!edge.label) return [];
    const source = boxMap.get(edge.source)!;
    const offset = edge.sourceOffset;
    const textWidth = String(edge.label).length * 5.6 + 14;
    const width = Math.max(54, Math.min(145, textWidth));
    const lines = Math.max(1, Math.ceil(textWidth / width));
    const height = lines * 13 + 8;
    const horizontal = edge.sourceSide === Position.Right || edge.sourceSide === Position.Left;
    const sourceX = horizontal ? (edge.sourceSide === Position.Right ? source.x + source.width : source.x)
      : source.x + source.width * offset;
    const sourceY = horizontal ? source.y + source.height * offset
      : (edge.sourceSide === Position.Bottom ? source.y + source.height : source.y);
    const x = edge.sourceSide === Position.Right ? sourceX + 12
      : edge.sourceSide === Position.Left ? sourceX - 12 - width : sourceX - width / 2;
    const y = horizontal ? sourceY - 8 - height
      : edge.sourceSide === Position.Bottom ? sourceY + 12 : sourceY - 12 - height;
    return [{ id: `label-${edge.id}`, ownerId: edge.source, x, y, width, height }];
  });
}
function edgePoint(box: Box, side: Position, offset = 0.5) {
  if (side === Position.Left) return { x: box.x - EDGE_NODE_GAP, y: box.y + box.height * offset };
  if (side === Position.Right) return { x: box.x + box.width + EDGE_NODE_GAP, y: box.y + box.height * offset };
  if (side === Position.Top) return { x: box.x + box.width * offset, y: box.y - EDGE_NODE_GAP };
  return { x: box.x + box.width * offset, y: box.y + box.height + EDGE_NODE_GAP };
}
/** Conservative bounds cover the start polygon and stroke-scaled end marker. */
function arrowZones(routes: ReturnType<typeof routeEdges>, boxes: Box[]): Box[] {
  const boxMap = new Map(boxes.map(box => [box.id, box]));
  return routes.flatMap(edge => [
    edgePoint(boxMap.get(edge.source)!, edge.sourceSide, edge.sourceOffset),
    edgePoint(boxMap.get(edge.target)!, edge.targetSide, edge.targetOffset),
  ].map((point, index) => ({ id: `arrow-${edge.id}-${index}`,
    x: point.x - 28, y: point.y - 28, width: 56, height: 56 })));
}
function segmentCorridor(id: string, a: Point, b: Point, ownerIds: string[], padding = 20): OwnedBox {
  return {
    id,
    ownerIds,
    x: Math.min(a.x, b.x) - padding,
    y: Math.min(a.y, b.y) - padding,
    width: Math.max(1, Math.abs(a.x - b.x)) + padding * 2,
    height: Math.max(1, Math.abs(a.y - b.y)) + padding * 2,
  };
}
/** Reserve foreign edge corridors so a box cannot appear connected to an unrelated line. */
function edgeCorridors(routes: ReturnType<typeof routeEdges>, boxes: Box[]) {
  const boxMap = new Map(boxes.map(box => [box.id, box]));
  return routes.flatMap(edge => {
    const start = edgePoint(boxMap.get(edge.source)!, edge.sourceSide, edge.sourceOffset);
    const end = edgePoint(boxMap.get(edge.target)!, edge.targetSide, edge.targetOffset);
    const owners = [edge.source, edge.target];
    const horizontal = edge.sourceSide === Position.Left || edge.sourceSide === Position.Right;
    const middle = horizontal
      ? { first: { x: (start.x + end.x) / 2 + edge.lane, y: start.y }, second: { x: (start.x + end.x) / 2 + edge.lane, y: end.y } }
      : { first: { x: start.x, y: (start.y + end.y) / 2 + edge.lane }, second: { x: end.x, y: (start.y + end.y) / 2 + edge.lane } };
    return [
      segmentCorridor(`route-${edge.id}-1`, start, middle.first, owners),
      segmentCorridor(`route-${edge.id}-2`, middle.first, middle.second, owners),
      segmentCorridor(`route-${edge.id}-3`, middle.second, end, owners),
    ];
  });
}
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
    props.compact
      ? { x: position.y / 0.6, y: position.x }
      : { x: position.x, y: position.y };
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const dragging = useRef(false);
  const [sizes, setSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const boxes = useMemo(() => {
      let arranged = separateBoxes(
        model.nodes.map((n) => ({
          id: n.id,
          positionLocked: n.positionLocked,
          ...toView(n.position),
          width: props.compact ? 230 : 290,
          height:
            sizes[`${props.compact}:${n.id}`]?.height ??
            (props.compact ? 220 : 310),
        })),
        props.compact,
      );
      for (let pass = 0; pass < 5; pass++) {
        const passRoutes = routeEdges(model.edges, arranged);
        const labels = placeLabels(labelZones(passRoutes, arranged), arranged, 7, arrowZones(passRoutes, arranged));
        const next = separateBoxesAroundObstacles(
          arranged,
          [...labels, ...edgeCorridors(passRoutes, arranged)],
          props.compact,
        );
        if (next.every((box, index) => box.x === arranged[index].x && box.y === arranged[index].y)) break;
        arranged = next;
      }
      return arranged;
    },
    [model.revision, props.compact, sizes],
  );
  const boxMap = new Map(boxes.map((b) => [b.id, b]));
  // During a drag the arrows follow ReactFlow's live positions, not saved ones.
  const routeBoxes = dragging.current ? boxes.map(box => {
    const live = nodes.find(node => node.id === box.id);
    return live ? { ...box, ...live.position } : box;
  }) : boxes;
  // Handle sides/offsets stay fixed until drag-stop updates node internals.
  const routes = routeEdges(model.edges, boxes);
  const labels = placeLabels(labelZones(routes, routeBoxes), routeBoxes, 7, arrowZones(routes, routeBoxes));
  const labelMap = new Map(labels.map(label => [label.id.replace(/^label-/, ""), label]));
  function movedPosition(id: string, position: Point) {
    return toModel(position);
  }
  function manualPositions(moved: Map<string, Point>): Operation[] {
    // Capture the whole visible arrangement, so saving a drag cannot rearrange neighbours.
    return boxes.map(box => ({
      type: "update_node" as const,
      id: box.id,
      changes: { position: toModel(moved.get(box.id) ?? box), positionLocked: true },
    }));
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
        incoming: routes.filter(e => e.target === n.id).map(e => ({
          id: `target-${e.id}`, side: e.targetSide, offset: e.targetOffset * 100,
        })),
        ports: routes.filter(e => e.source === n.id).map(e => ({
          id: `source-${e.id}`, side: e.sourceSide, offset: e.sourceOffset * 100,
        })),
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
    if (dragging.current) return;
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
  const structureKey = model.nodes.map(node => node.id).join(",") + "|" +
    model.edges.map(edge => `${edge.id}:${edge.source}:${edge.target}`).join(",");
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
  }, [hasNodes, structureKey, sizes, props.fitToken, props.compact, fitBounds]);
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
  const colorOrder = [...routes].sort((a, b) => edgeHash(a.id) - edgeHash(b.id) || a.id.localeCompare(b.id));
  const edges: Edge[] = routes.map(({ label, sourceSide, targetSide, sourceOffset, targetOffset, lane, ...edge }) => {
    const color = branchColors[colorOrder.findIndex(e => e.id === edge.id) % branchColors.length];
    return ({
    ...edge,
    type: "condition",
    label,
    data: { onSelect: props.onEdge, lane, labelBox: labelMap.get(edge.id) },
    sourceHandle: `source-${edge.id}`,
    targetHandle: `target-${edge.id}`,
    ariaLabel: `Connection ${edge.source} → ${edge.target}${label ? `: ${label}` : ""}`,
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
    style: { stroke: color, strokeWidth: 2 },
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
                positionLocked: true,
                position: movedPosition(node.id, {
                  x: boxMap.get(node.id)!.x + direction[0] * amount,
                  y: boxMap.get(node.id)!.y + direction[1] * amount,
                }),
              },
            },
          ],
          `${node.id} moved with the keyboard`,
        );
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
          dragging.current = true;
          dragRevision.current = model.revision;
        }}
        onNodeDragStop={async (_, _node, dragged) => {
          dragging.current = false;
          const operations = manualPositions(new Map(dragged.map(n => [n.id, n.position])));
          if (!operations.length) return;
          const ok = await onChange(
            operations,
            "Box positions updated",
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
