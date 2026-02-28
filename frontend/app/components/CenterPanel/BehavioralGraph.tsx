'use client';

import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useViewport,
  type Node,
  type Edge,
  type NodeChange,
  type NodePositionChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import type { AgentStatus, InvestigatorSelection } from '../../types';
import { violationCounts, agents } from '../../data/mockData';
import { nodeTypes } from './CustomNodes';
import { edgeTypes } from './CustomEdges';

// Node radius for collision detection (based on visual sizes)
const NODE_RADII: Record<string, number> = {
  agent: 32,        // 64px / 2
  superintendent: 28, // 56px / 2
  investigator: 24,  // 48px / 2
  tripwire: 25,      // 50px / 2
  patrol: 20,        // ~40px / 2
};

interface BehavioralGraphProps {
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  getAgentStatus: (agentId: string) => AgentStatus;
  historicalAgentStates?: Record<string, AgentStatus>;
  isLive?: boolean;
  investigatorSelection: InvestigatorSelection | null;
  onInvestigatorSelect: (selection: InvestigatorSelection | null) => void;
  // When set, triggers an assignment of investigator to target agent
  pendingAssignment: { investigatorId: string; targetAgentId: string } | null;
  onAssignmentComplete: () => void;
  showHeatmap?: boolean;
}

// Store initial edge lengths for constraint-based dragging
const edgeLengths = new Map<string, number>();

// Helper to calculate distance between two positions
function calculateDistance(pos1: { x: number; y: number }, pos2: { x: number; y: number }): number {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper to generate fully interconnected edges for a cluster
function generateClusterEdges(agentIds: string[], clusterPrefix: string): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      edges.push({
        id: `${clusterPrefix}-e-${agentIds[i]}-${agentIds[j]}`,
        source: agentIds[i],
        target: agentIds[j],
        type: 'animated',
        data: { color: '#4b5563' },
      });
    }
  }
  return edges;
}

// Cluster 1 - Top Left
const cluster1Agents: Node[] = [
  { id: 'c1-email', type: 'agent', position: { x: 100, y: 100 }, data: { label: 'email-agent-01', status: 'critical' } },
  { id: 'c1-coding', type: 'agent', position: { x: 200, y: 180 }, data: { label: 'coding-agent-01', status: 'clean' } },
  { id: 'c1-document', type: 'agent', position: { x: 50, y: 200 }, data: { label: 'document-agent-01', status: 'clean' } },
  { id: 'c1-data', type: 'agent', position: { x: 150, y: 280 }, data: { label: 'data-query-agent-01', status: 'warning' } },
];

// Cluster 2 - Top Right
const cluster2Agents: Node[] = [
  { id: 'c2-email', type: 'agent', position: { x: 450, y: 100 }, data: { label: 'email-agent-02', status: 'clean' } },
  { id: 'c2-coding', type: 'agent', position: { x: 550, y: 180 }, data: { label: 'coding-agent-02', status: 'clean' } },
  { id: 'c2-document', type: 'agent', position: { x: 400, y: 200 }, data: { label: 'document-agent-02', status: 'clean' } },
  { id: 'c2-data', type: 'agent', position: { x: 500, y: 280 }, data: { label: 'data-query-agent-02', status: 'clean' } },
];

// Cluster 3 - Bottom Left
const cluster3Agents: Node[] = [
  { id: 'c3-email', type: 'agent', position: { x: 100, y: 450 }, data: { label: 'email-agent-03', status: 'clean' } },
  { id: 'c3-coding', type: 'agent', position: { x: 200, y: 530 }, data: { label: 'coding-agent-03', status: 'clean' } },
  { id: 'c3-document', type: 'agent', position: { x: 50, y: 550 }, data: { label: 'document-agent-03', status: 'warning' } },
  { id: 'c3-data', type: 'agent', position: { x: 150, y: 630 }, data: { label: 'data-query-agent-03', status: 'clean' } },
];

// Cluster 4 - Bottom Right
const cluster4Agents: Node[] = [
  { id: 'c4-email', type: 'agent', position: { x: 450, y: 450 }, data: { label: 'email-agent-04', status: 'clean' } },
  { id: 'c4-coding', type: 'agent', position: { x: 550, y: 530 }, data: { label: 'coding-agent-04', status: 'clean' } },
  { id: 'c4-document', type: 'agent', position: { x: 400, y: 550 }, data: { label: 'document-agent-04', status: 'clean' } },
  { id: 'c4-data', type: 'agent', position: { x: 500, y: 630 }, data: { label: 'data-query-agent-04', status: 'critical' } },
];

// System nodes (patrol, superintendent, investigators)
const systemNodes: Node[] = [
  // Patrol nodes — positions animated at runtime, draggable enabled
  { id: 'p1', type: 'patrol', position: { x: 280, y: 330 }, data: { label: 'Patrol-1', status: 'active' } },
  { id: 'p2', type: 'patrol', position: { x: 320, y: 330 }, data: { label: 'Patrol-2', status: 'active' } },
  // Superintendent node (center)
  { id: 'inv', type: 'superintendent', position: { x: 300, y: 360 }, data: { label: 'Superintendent', status: 'active' } },
  // Investigator nodes
  { id: 'f1', type: 'investigator', position: { x: 270, y: 390 }, data: { label: 'Investigator-1', status: 'active' } },
  { id: 'f2', type: 'investigator', position: { x: 330, y: 390 }, data: { label: 'Investigator-2', status: 'active' } },
];

// Combine all nodes
const initialNodes: Node[] = [
  ...cluster1Agents,
  ...cluster2Agents,
  ...cluster3Agents,
  ...cluster4Agents,
  ...systemNodes,
];

// Generate fully interconnected edges for each cluster
const cluster1Edges = generateClusterEdges(cluster1Agents.map(n => n.id), 'c1');
const cluster2Edges = generateClusterEdges(cluster2Agents.map(n => n.id), 'c2');
const cluster3Edges = generateClusterEdges(cluster3Agents.map(n => n.id), 'c3');
const cluster4Edges = generateClusterEdges(cluster4Agents.map(n => n.id), 'c4');

// System edges (superintendent connections only - investigators start unattached)
const systemEdges: Edge[] = [];

// Combine all edges
const initialEdges: Edge[] = [
  ...cluster1Edges,
  ...cluster2Edges,
  ...cluster3Edges,
  ...cluster4Edges,
  ...systemEdges,
];

export function BehavioralGraph({
  selectedAgentId,
  onSelectAgent,
  getAgentStatus,
  historicalAgentStates,
  isLive = true,
  investigatorSelection,
  onInvestigatorSelect,
  pendingAssignment,
  onAssignmentComplete,
  showHeatmap = false,
}: BehavioralGraphProps) {
  // Ensure client-side only rendering for animations to prevent hydration mismatch
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get the effective status for an agent (historical or live)
  const getEffectiveStatus = useCallback(
    (agentId: string): AgentStatus => {
      if (!isLive && historicalAgentStates && historicalAgentStates[agentId]) {
        return historicalAgentStates[agentId];
      }
      return getAgentStatus(agentId);
    },
    [isLive, historicalAgentStates, getAgentStatus]
  );

  // Track investigator connections (investigatorId -> targetNodeId)
  const investigatorConnections = useRef<Map<string, string>>(new Map());

  // Initialize state
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Investigator click handler - toggles selection in sidebar
  const handleInvestigatorClick = useCallback((investigatorId: string) => {
    // If clicking the same investigator that's already selected, cancel the selection
    if (investigatorSelection?.investigatorId === investigatorId) {
      onInvestigatorSelect(null);
      return;
    }

    // Find from initialNodes instead of state nodes to avoid dependency
    const investigatorNode = initialNodes.find((n) => n.id === investigatorId);
    if (investigatorNode) {
      onInvestigatorSelect({
        investigatorId,
        investigatorLabel: investigatorNode.data.label,
      });
    }
  }, [onInvestigatorSelect, investigatorSelection]);

  // Handle agent selection from sidebar (called via onInvestigatorAssign)
  const handleAgentAssignment = useCallback(
    (investigatorId: string, targetNodeId: string) => {

      setNodes((currentNodes) => {
        const nodesList = currentNodes as Node[];

        // Find the investigator and target nodes
        const investigatorNode = nodesList.find((n) => n.id === investigatorId);
        const targetNode = nodesList.find((n) => n.id === targetNodeId);

        if (!investigatorNode || !targetNode || !investigatorNode.position || !targetNode.position) {
          return currentNodes;
        }

        // Store connection
        investigatorConnections.current.set(investigatorId, targetNodeId);

        // Calculate distance between nodes
        const investigatorRadius = NODE_RADII[investigatorNode.type || 'investigator'] || 24;
        const targetRadius = NODE_RADII.agent;

        const investigatorCenterX = investigatorNode.position.x + investigatorRadius;
        const investigatorCenterY = investigatorNode.position.y + investigatorRadius;
        const targetCenterX = targetNode.position.x + targetRadius;
        const targetCenterY = targetNode.position.y + targetRadius;

        const dx = targetCenterX - investigatorCenterX;
        const dy = targetCenterY - investigatorCenterY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        // Store edge length for physics
        const edgeId = `inv-${investigatorId}-${targetNodeId}`;

        // Move investigator closer to the target agent (about 100px away)
        const desiredDistance = 100;
        let newInvestigatorCenterX = investigatorCenterX;
        let newInvestigatorCenterY = investigatorCenterY;

        if (currentDistance > desiredDistance) {
          const ratio = desiredDistance / currentDistance;
          newInvestigatorCenterX = targetCenterX - dx * ratio;
          newInvestigatorCenterY = targetCenterY - dy * ratio;
        }

        const newPos = {
          x: newInvestigatorCenterX - investigatorRadius,
          y: newInvestigatorCenterY - investigatorRadius,
        };

        const newDx = targetCenterX - newInvestigatorCenterX;
        const newDy = targetCenterY - newInvestigatorCenterY;
        const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);
        edgeLengths.set(edgeId, newDistance);

        setEdges((currentEdges) => {
          const filteredEdges = currentEdges.filter((edge) => edge.source !== investigatorId);
          return [
            ...filteredEdges,
            {
              id: edgeId,
              source: investigatorId,
              target: targetNodeId,
              type: 'animated',
              data: { color: '#9b59b6', animated: true },
            },
          ];
        });

        if (investigatorId === 'p1' || investigatorId === 'p2') {
          // Slide patrol agents smoothly to target instead of respawning/snapping
          patrolTarget.current[investigatorId as 'p1' | 'p2'] = newPos;
          return currentNodes;
        } else {
          // Snap regular investigators instantly
          return nodesList.map((n) => {
            if (n.id === investigatorId) {
              return { ...n, position: newPos };
            }
            return n;
          });
        }
      });

      // Notify parent that assignment is complete
      onInvestigatorSelect(null);
    },
    [setNodes, setEdges, onInvestigatorSelect]
  );

  // Watch for pending assignments from the sidebar
  useEffect(() => {
    if (pendingAssignment) {
      handleAgentAssignment(pendingAssignment.investigatorId, pendingAssignment.targetAgentId);
      onAssignmentComplete();
    }
  }, [pendingAssignment, handleAgentAssignment, onAssignmentComplete]);

  // Update nodes with current status and selection state
  const nodesWithStatus = useMemo(() => {
    return initialNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isSelected: node.id === selectedAgentId,
        currentStatus: node.type === 'agent' ? getEffectiveStatus(node.id) : undefined,
        // Add click handler for patrol nodes
        ...(node.type === 'patrol' && {
          onInvestigatorClick: handleInvestigatorClick,
        }),
      },
    }));
  }, [selectedAgentId, getEffectiveStatus, handleInvestigatorClick]);

  // Update edges based on agent states
  const edgesWithStatus = useMemo(() => {
    return initialEdges.map((edge) => {
      // Update system edges (superintendent/investigator connections) based on target agent status
      if (edge.id.startsWith('sys-')) {
        const targetStatus = getEffectiveStatus(edge.target);
        const isInvestigating = targetStatus === 'critical' || targetStatus === 'warning';
        return {
          ...edge,
          data: {
            ...edge.data,
            animated: isInvestigating,
          },
        };
      }
      return edge;
    });
  }, [getEffectiveStatus]);

  // Initialize edge lengths on first render
  const edgeLengthsInitialized = useRef(false);

  useEffect(() => {
    if (!edgeLengthsInitialized.current && nodes.length > 0) {
      // Calculate and store initial edge lengths
      initialEdges.forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);

        if (sourceNode && targetNode) {
          const sourceRadius = NODE_RADII[sourceNode.type || 'agent'] || 32;
          const targetRadius = NODE_RADII[targetNode.type || 'agent'] || 32;

          const sourceCenterX = sourceNode.position.x + sourceRadius;
          const sourceCenterY = sourceNode.position.y + sourceRadius;
          const targetCenterX = targetNode.position.x + targetRadius;
          const targetCenterY = targetNode.position.y + targetRadius;

          const length = calculateDistance(
            { x: sourceCenterX, y: sourceCenterY },
            { x: targetCenterX, y: targetCenterY }
          );

          edgeLengths.set(edge.id, length);
        }
      });

      edgeLengthsInitialized.current = true;
    }
  }, [nodes]);

  // Custom node change handler with collision physics and fixed-length constraints
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // First apply the base changes
      onNodesChangeBase(changes);

      // Track patrol drag state and sync positions back into patrolPos
      changes.forEach((change) => {
        if (change.type === 'position' && (change.id === 'p1' || change.id === 'p2')) {
          const pid = change.id as 'p1' | 'p2';
          if (change.dragging && change.position) {
            patrolDragging.current[pid] = true;
            patrolPos.current[pid] = change.position;
            patrolTarget.current[pid] = change.position;
          } else if (!change.dragging) {
            patrolDragging.current[pid] = false;
          }
        }
      });

      // Check for position changes (dragging)
      const positionChanges = changes.filter(
        (change): change is NodePositionChange =>
          change.type === 'position' && change.dragging === true && change.position !== undefined
      );

      if (positionChanges.length === 0) return;

      // Apply fixed-length constraints and collision resolution
      setNodes((currentNodes) => {
        let updatedNodes = [...currentNodes];

        // Apply fixed-length constraints for dragged nodes
        const draggedNodeIds = new Set(positionChanges.map((c) => c.id));
        const processedNodes = new Set<string>();

        // Iteratively apply constraints to maintain fixed edge lengths
        const constraintIterations = 3;
        for (let iter = 0; iter < constraintIterations; iter++) {
          const nodesToProcess = [...draggedNodeIds];

          while (nodesToProcess.length > 0) {
            const nodeId = nodesToProcess.shift()!;
            if (processedNodes.has(nodeId) && iter > 0) continue;
            processedNodes.add(nodeId);

            const draggedNode = updatedNodes.find((n) => n.id === nodeId);
            if (!draggedNode || draggedNode.draggable === false) continue;

            // Find all edges connected to this node (cluster edges + investigator edges, not system edges)
            const connectedEdges = [...initialEdges, ...edges].filter(
              (edge) =>
                !edge.id.startsWith('sys-') &&
                (edge.source === nodeId || edge.target === nodeId)
            );

            // For each connected edge, adjust the connected node to maintain fixed length
            connectedEdges.forEach((edge) => {
              const isSource = edge.source === nodeId;
              const connectedNodeId = isSource ? edge.target : edge.source;
              const connectedNode = updatedNodes.find((n) => n.id === connectedNodeId);

              if (!connectedNode || connectedNode.draggable === false) return;

              const fixedLength = edgeLengths.get(edge.id);
              if (!fixedLength) return;

              const draggedRadius = NODE_RADII[draggedNode.type || 'agent'] || 32;
              const connectedRadius = NODE_RADII[connectedNode.type || 'agent'] || 32;

              const draggedCenterX = draggedNode.position.x + draggedRadius;
              const draggedCenterY = draggedNode.position.y + draggedRadius;
              const connectedCenterX = connectedNode.position.x + connectedRadius;
              const connectedCenterY = connectedNode.position.y + connectedRadius;

              // Calculate current distance
              const dx = connectedCenterX - draggedCenterX;
              const dy = connectedCenterY - draggedCenterY;
              const currentDistance = Math.sqrt(dx * dx + dy * dy);

              if (currentDistance > 0.1) {
                // Calculate new position to maintain fixed length
                const ratio = fixedLength / currentDistance;
                const newConnectedCenterX = draggedCenterX + dx * ratio;
                const newConnectedCenterY = draggedCenterY + dy * ratio;

                // Update the connected node position
                const nodeIndex = updatedNodes.findIndex((n) => n.id === connectedNodeId);
                if (nodeIndex !== -1) {
                  updatedNodes[nodeIndex] = {
                    ...updatedNodes[nodeIndex],
                    position: {
                      x: newConnectedCenterX - connectedRadius,
                      y: newConnectedCenterY - connectedRadius,
                    },
                  };

                  // Add this node to be processed for its connections
                  if (!draggedNodeIds.has(connectedNodeId)) {
                    nodesToProcess.push(connectedNodeId);
                    draggedNodeIds.add(connectedNodeId);
                  }
                }
              }
            });
          }
        }

        // Apply collision resolution
        {
          let hasCollision = true;
          let iterations = 0;
          const maxIterations = 10;

          while (hasCollision && iterations < maxIterations) {
            hasCollision = false;
            iterations++;

            for (let i = 0; i < updatedNodes.length; i++) {
              for (let j = i + 1; j < updatedNodes.length; j++) {
                const nodeA = updatedNodes[i];
                const nodeB = updatedNodes[j];

                const nodeAIsDraggable = nodeA.draggable !== false;
                const nodeBIsDraggable = nodeB.draggable !== false;

              const radiusA = NODE_RADII[nodeA.type || 'agent'] || 32;
              const radiusB = NODE_RADII[nodeB.type || 'agent'] || 32;

              const centerAX = nodeA.position.x + radiusA;
              const centerAY = nodeA.position.y + radiusA;
              const centerBX = nodeB.position.x + radiusB;
              const centerBY = nodeB.position.y + radiusB;

              const dx = centerBX - centerAX;
              const dy = centerBY - centerAY;
              const distance = Math.sqrt(dx * dx + dy * dy);

              const minDistance = radiusA + radiusB + 8;

              if (distance < minDistance && distance > 0) {
                hasCollision = true;

                const overlap = minDistance - distance;
                const nx = dx / distance;
                const ny = dy / distance;

                const nodeAWasDragged = draggedNodeIds.has(nodeA.id);
                const nodeBWasDragged = draggedNodeIds.has(nodeB.id);

                if (nodeAWasDragged && nodeBIsDraggable) {
                  updatedNodes[j] = {
                    ...nodeB,
                    position: {
                      x: nodeB.position.x + nx * overlap,
                      y: nodeB.position.y + ny * overlap,
                    },
                  };
                } else if (nodeBWasDragged && nodeAIsDraggable) {
                  updatedNodes[i] = {
                    ...nodeA,
                    position: {
                      x: nodeA.position.x - nx * overlap,
                      y: nodeA.position.y - ny * overlap,
                    },
                  };
                } else if (nodeAIsDraggable && nodeBIsDraggable) {
                  const halfOverlap = overlap / 2;
                  updatedNodes[i] = {
                    ...nodeA,
                    position: {
                      x: nodeA.position.x - nx * halfOverlap,
                      y: nodeA.position.y - ny * halfOverlap,
                    },
                  };
                  updatedNodes[j] = {
                    ...nodeB,
                    position: {
                      x: nodeB.position.x + nx * halfOverlap,
                      y: nodeB.position.y + ny * halfOverlap,
                    },
                  };
                } else if (nodeAIsDraggable) {
                  updatedNodes[i] = {
                    ...nodeA,
                    position: {
                      x: nodeA.position.x - nx * overlap,
                      y: nodeA.position.y - ny * overlap,
                    },
                  };
                } else if (nodeBIsDraggable) {
                  updatedNodes[j] = {
                    ...nodeB,
                    position: {
                      x: nodeB.position.x + nx * overlap,
                      y: nodeB.position.y + ny * overlap,
                    },
                  };
                }
              }
            }
          }
        }
        }

        return updatedNodes;
      });
    },
    [onNodesChangeBase, setNodes]
  );

  // Track current patrol positions in a ref so the status-update effect preserves them
  const patrolPos = useRef({ p1: { x: 280, y: 330 }, p2: { x: 320, y: 330 } });
  const patrolTarget = useRef({ p1: { x: 280, y: 330 }, p2: { x: 320, y: 330 } });
  const patrolDragging = useRef({ p1: false, p2: false });
  const isMounted = useRef(false);

  // Random walk: pick new targets every 2s, glide towards them at ~30fps
  useEffect(() => {
    // Don't start animation until client-side hydration is complete
    if (!isClient) return;

    isMounted.current = true;

    const pickTargets = () => {
      const wander = (pos: { x: number; y: number }) => ({
        x: Math.max(200, Math.min(400, pos.x + (Math.random() - 0.5) * 100)),
        y: Math.max(250, Math.min(450, pos.y + (Math.random() - 0.5) * 100)),
      });
      if (!investigatorConnections.current.has('p1')) {
        patrolTarget.current.p1 = wander(patrolPos.current.p1);
      }
      if (!investigatorConnections.current.has('p2')) {
        patrolTarget.current.p2 = wander(patrolPos.current.p2);
      }
    };

    const targetTimer = setInterval(pickTargets, 2000);

    const moveTimer = setInterval(() => {
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const t = 0.04;
      const newP1 = (investigatorConnections.current.has('p1') || patrolDragging.current.p1) ? patrolPos.current.p1 : {
        x: lerp(patrolPos.current.p1.x, patrolTarget.current.p1.x, t),
        y: lerp(patrolPos.current.p1.y, patrolTarget.current.p1.y, t),
      };
      const newP2 = (investigatorConnections.current.has('p2') || patrolDragging.current.p2) ? patrolPos.current.p2 : {
        x: lerp(patrolPos.current.p2.x, patrolTarget.current.p2.x, t),
        y: lerp(patrolPos.current.p2.y, patrolTarget.current.p2.y, t),
      };
      patrolPos.current.p1 = newP1;
      patrolPos.current.p2 = newP2;

      setNodes((nds) => {
        // First update patrol positions for roaming and gliding to targets
        let updatedNodes = nds.map((n) => {
          if (n.id === 'p1') return { ...n, position: newP1 };
          if (n.id === 'p2') return { ...n, position: newP2 };
          return n;
        });

        // Apply collision resolution for patrol nodes pushing others
        const patrolIds = ['p1', 'p2'];
        let hasCollision = true;
        let iterations = 0;

        while (hasCollision && iterations < 5) {
          hasCollision = false;
          iterations++;

          for (const patrolId of patrolIds) {
            const patrolNode = updatedNodes.find((n) => n.id === patrolId);
            if (!patrolNode) continue;

            const patrolRadius = NODE_RADII.patrol;
            const patrolCenterX = patrolNode.position.x + patrolRadius;
            const patrolCenterY = patrolNode.position.y + patrolRadius;

            updatedNodes = updatedNodes.map((node) => {
              if (node.id === patrolId || node.draggable === false) return node;

              const nodeRadius = NODE_RADII[node.type || 'agent'] || 32;
              const nodeCenterX = node.position.x + nodeRadius;
              const nodeCenterY = node.position.y + nodeRadius;

              const dx = nodeCenterX - patrolCenterX;
              const dy = nodeCenterY - patrolCenterY;
              const distance = Math.sqrt(dx * dx + dy * dy);
              const minDistance = patrolRadius + nodeRadius + 8;

              if (distance < minDistance && distance > 0) {
                hasCollision = true;
                const overlap = minDistance - distance;
                const nx = dx / distance;
                const ny = dy / distance;

                return {
                  ...node,
                  position: {
                    x: node.position.x + nx * overlap,
                    y: node.position.y + ny * overlap,
                  },
                };
              }

              return node;
            });
          }
        }

        return updatedNodes;
      });
    }, 33);

    return () => {
      isMounted.current = false;
      clearInterval(targetTimer);
      clearInterval(moveTimer);
    };
  }, [isClient, setNodes]);

  // Update nodes when selection or status changes, preserving all current positions
  useEffect(() => {
    setNodes((currentNodes) => {
      // Create a map of current positions
      const currentPositions = new Map(
        currentNodes.map((node) => [node.id, node.position])
      );

      return nodesWithStatus.map((n) => {
        // Preserve current position if it exists, otherwise use the new position
        const preservedPosition = currentPositions.get(n.id) || n.position;

        // Special handling for patrol nodes to use their animated positions
        if (n.id === 'p1') return { ...n, position: patrolPos.current.p1 };
        if (n.id === 'p2') return { ...n, position: patrolPos.current.p2 };

        return { ...n, position: preservedPosition };
      });
    });
  }, [nodesWithStatus, setNodes]);

  // Update edges when status changes
  useEffect(() => {
    setEdges(edgesWithStatus);
  }, [edgesWithStatus, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Only select agent nodes
      if (node.type === 'agent') {
        // Toggle selection if clicking the same node
        if (node.id === selectedAgentId) {
          onSelectAgent(null);
        } else {
          onSelectAgent(node.id);
        }
      }
    },
    [onSelectAgent, selectedAgentId]
  );

  // Click on background to deselect
  const onPaneClick = useCallback(() => {
    onSelectAgent(null);
  }, [onSelectAgent]);

  return (
    <div className="h-full flex flex-col bg-[#0a0e1a]">
      {/* Historical mode indicator */}
      {!isLive && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-[#ffaa00]/20 text-[#ffaa00] px-3 py-1 rounded-full text-xs font-medium border border-[#ffaa00]/30">
          Historical View
        </div>
      )}

      {/* Graph Area */}
      <div className="flex-1 relative">
        {isClient ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.5}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag={[0]}
            zoomOnScroll={true}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#1f2937"
            />
            {showHeatmap && (
              <HeatmapOverlay nodes={nodes} getEffectiveStatus={getEffectiveStatus} />
            )}
          </ReactFlow>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Loading graph...</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Heatmap Overlay ──────────────────────────────────────────────────────────
// Renders smooth blob cluster zones + per-agent radial threat glows behind nodes

const HEATMAP_STATUS_COLORS: Record<AgentStatus, string> = {
  critical: '#ff3355',
  warning: '#ffaa00',
  clean: '#00c853',
  suspended: '#6b7280',
};

// Build a lookup: agentId → violation count
const violationMap = new Map<string, number>();
agents.forEach((a, i) => violationMap.set(a.id, violationCounts[i]));

// Cluster definitions
const CLUSTER_DEFS = [
  { prefix: 'c1', label: 'Host 1', ids: ['c1-email', 'c1-coding', 'c1-document', 'c1-data'] },
  { prefix: 'c2', label: 'Host 2', ids: ['c2-email', 'c2-coding', 'c2-document', 'c2-data'] },
  { prefix: 'c3', label: 'Host 3', ids: ['c3-email', 'c3-coding', 'c3-document', 'c3-data'] },
  { prefix: 'c4', label: 'Host 4', ids: ['c4-email', 'c4-coding', 'c4-document', 'c4-data'] },
];

type Vec2 = { x: number; y: number };

// ── Convex Hull (Gift-wrapping / Jarvis march) ───────────────────────────────
function convexHull(pts: Vec2[]): Vec2[] {
  if (pts.length < 3) return pts;
  const n = pts.length;
  // Find the leftmost point
  let start = 0;
  for (let i = 1; i < n; i++) if (pts[i].x < pts[start].x) start = i;

  const hull: Vec2[] = [];
  let cur = start;
  do {
    hull.push(pts[cur]);
    let next = (cur + 1) % n;
    for (let i = 0; i < n; i++) {
      const cross =
        (pts[next].x - pts[cur].x) * (pts[i].y - pts[cur].y) -
        (pts[next].y - pts[cur].y) * (pts[i].x - pts[cur].x);
      if (cross < 0) next = i;
    }
    cur = next;
  } while (cur !== start);
  return hull;
}

// ── Expand hull outward from its centroid by `pad` pixels ───────────────────
function expandHull(hull: Vec2[], pad: number): Vec2[] {
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });
}

// ── Convert hull points to a smooth closed SVG blob path (catmull-rom) ───────
function smoothBlobPath(pts: Vec2[], tension = 0.4): string {
  if (pts.length < 2) return '';
  const n = pts.length;

  // Wrap-around: prepend last point and append first two
  const wrapped = [pts[n - 1], ...pts, pts[0], pts[1]];

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = wrapped[i];
    const p1 = wrapped[i + 1];
    const p2 = wrapped[i + 2];
    const p3 = wrapped[i + 3];

    // Catmull-Rom → cubic bezier control points
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d + ' Z';
}

function HeatmapOverlay({
  nodes,
  getEffectiveStatus,
}: {
  nodes: Node[];
  getEffectiveStatus: (agentId: string) => AgentStatus;
}) {
  const { x, y, zoom } = useViewport();

  // Build a position map from live node state (center of each agent node)
  const posMap = useMemo(() => {
    const m = new Map<string, Vec2>();
    for (const n of nodes) {
      if (n.type === 'agent') {
        const r = NODE_RADII.agent;
        m.set(n.id, { x: n.position.x + r, y: n.position.y + r });
      }
    }
    return m;
  }, [nodes]);

  // Compute smooth blob paths for each cluster
  const clusterBlobs = useMemo(() => {
    return CLUSTER_DEFS.map((cluster) => {
      const positions = cluster.ids.map((id) => posMap.get(id)).filter(Boolean) as Vec2[];
      if (positions.length === 0) return null;

      const hull = convexHull(positions);
      const expanded = expandHull(hull, 68);
      const path = smoothBlobPath(expanded, 0.38);

      // Worst status in cluster
      const statuses = cluster.ids.map((id) => getEffectiveStatus(id));
      let worstStatus: AgentStatus = 'clean';
      if (statuses.includes('critical')) worstStatus = 'critical';
      else if (statuses.includes('warning')) worstStatus = 'warning';
      else if (statuses.includes('suspended')) worstStatus = 'suspended';

      const color = HEATMAP_STATUS_COLORS[worstStatus];
      const fillOpacity = worstStatus === 'critical' ? 0.07 : worstStatus === 'warning' ? 0.05 : 0.025;
      const strokeOpacity = worstStatus === 'critical' ? 0.25 : worstStatus === 'warning' ? 0.18 : 0.08;

      return { key: cluster.prefix, path, color, fillOpacity, strokeOpacity };
    }).filter(Boolean);
  }, [posMap, getEffectiveStatus]);

  // Per-agent radial glows
  const agentGlows = useMemo(() => {
    return Array.from(posMap.entries()).map(([id, pos]) => {
      const status = getEffectiveStatus(id);
      const violations = violationMap.get(id) || 0;

      if (status === 'clean' && violations === 0) return null;

      const color = HEATMAP_STATUS_COLORS[status];
      const baseRadius = 50;
      const statusBonus = status === 'critical' ? 40 : status === 'warning' ? 20 : 0;
      const violationBonus = violations * 15;
      const radius = baseRadius + statusBonus + violationBonus;
      const opacity = status === 'critical' ? 0.35 : status === 'warning' ? 0.2 : 0.1;

      return { key: id, cx: pos.x, cy: pos.y, radius, color, opacity };
    }).filter(Boolean);
  }, [posMap, getEffectiveStatus]);

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <defs>
        {agentGlows.map((glow) =>
          glow ? (
            <radialGradient key={`grad-${glow.key}`} id={`glow-${glow.key}`}>
              <stop offset="0%" stopColor={glow.color} stopOpacity={glow.opacity} />
              <stop offset="70%" stopColor={glow.color} stopOpacity={glow.opacity * 0.3} />
              <stop offset="100%" stopColor={glow.color} stopOpacity={0} />
            </radialGradient>
          ) : null
        )}
      </defs>

      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        {/* Smooth blob cluster zones */}
        {clusterBlobs.map((blob) =>
          blob ? (
            <path
              key={blob.key}
              d={blob.path}
              fill={blob.color}
              fillOpacity={blob.fillOpacity}
              stroke={blob.color}
              strokeOpacity={blob.strokeOpacity}
              strokeWidth={1.5 / zoom}
            />
          ) : null
        )}

        {/* Per-agent radial glows */}
        {agentGlows.map((glow) =>
          glow ? (
            <circle
              key={glow.key}
              cx={glow.cx}
              cy={glow.cy}
              r={glow.radius}
              fill={`url(#glow-${glow.key})`}
            />
          ) : null
        )}
      </g>
    </svg>
  );
}
