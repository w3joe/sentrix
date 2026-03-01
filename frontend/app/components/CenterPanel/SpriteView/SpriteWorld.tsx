'use client';

import { useRef, useCallback, useState } from 'react';
import { Application, extend } from '@pixi/react';
import { Container, Graphics, Text, Sprite, TilingSprite } from 'pixi.js';
import type { AgentStatus, PatrolSelection, Agent } from '../../../types';
import { WORLD_COLORS } from './config/spriteConfig';
import { WORLD_WIDTH, WORLD_HEIGHT } from './config/roomLayout';
import { FloorLayer } from './layers/FloorLayer';
import { FurnitureLayer, MonitorLayer } from './layers/FurnitureLayer';
import { WallsLayer } from './layers/WallsLayer';
import { EntityLayer, type PatrolResponseProps } from './layers/EntityLayer';
import { EffectsLayer } from './layers/EffectsLayer';

// Register PixiJS components
extend({ Container, Graphics, Text, Sprite, TilingSprite });

interface SpriteWorldProps {
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  getAgentStatus: (agentId: string) => AgentStatus;
  historicalAgentStates?: Record<string, AgentStatus>;
  isLive?: boolean;
  patrolSelection: PatrolSelection | null;
  onPatrolSelect: (selection: PatrolSelection | null) => void;
  pendingAssignment: { patrolId: string; targetAgentId: string } | null;
  onAssignmentComplete: () => void;
  agents: Agent[];
  response?: PatrolResponseProps;
}

export default function SpriteWorld({
  selectedAgentId,
  onSelectAgent,
  getAgentStatus,
  historicalAgentStates,
  isLive,
  patrolSelection,
  onPatrolSelect,
  pendingAssignment,
  onAssignmentComplete,
  agents,
  response,
}: SpriteWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Handle background click to deselect
  const handleBackgroundClick = useCallback(() => {
    onSelectAgent(null);
  }, [onSelectAgent]);

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) => Math.min(1.5, Math.max(0.4, prev - e.deltaY * 0.001)));
  }, []);

  // Background click draw
  const drawBackground = useCallback(
    (g: any) => {
      g.clear();
      g.setFillStyle({ color: WORLD_COLORS.background });
      g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      g.fill();
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      <Application
        resizeTo={containerRef}
        background={WORLD_COLORS.background}
        antialias
      >
        <pixiContainer x={pan.x} y={pan.y} scale={scale}>
          {/* Background (clickable to deselect) */}
          <pixiGraphics
            draw={drawBackground}
            eventMode="static"
            onTap={handleBackgroundClick}
            onClick={handleBackgroundClick}
          />

          {/* Floor layer (rooms, corridors) */}
          <FloorLayer />

          {/* Walls around rooms (behind furniture) */}
          <WallsLayer />

          {/* Furniture layer (desks, monitors) */}
          <FurnitureLayer />

          {/* Text labels for rooms */}
          <EffectsLayer />

          {/* All entities (agents, patrol, superintendent, investigators) */}
          <EntityLayer
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
            getAgentStatus={getAgentStatus}
            historicalAgentStates={historicalAgentStates}
            isLive={isLive}
            patrolSelection={patrolSelection}
            onPatrolSelect={onPatrolSelect}
            pendingAssignment={pendingAssignment}
            onAssignmentComplete={onAssignmentComplete}
            agents={agents}
            response={response}
          />

          {/* Monitors rendered on top of entities */}
          <MonitorLayer />
        </pixiContainer>
      </Application>

      {/* Historical mode banner */}
      {!isLive && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-yellow-900/80 text-yellow-200 px-4 py-1 rounded text-xs font-mono">
          Historical View
        </div>
      )}

      {/* Patrol selection banner */}
      {patrolSelection && (
        <div className="absolute top-3 right-3 bg-cyan-900/80 text-cyan-200 px-3 py-1 rounded text-xs font-mono">
          Select agent for {patrolSelection.patrolLabel}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}
          className="w-7 h-7 bg-[#1a1f2e] border border-[#374151] text-white rounded text-sm hover:bg-[#2a2f3e]"
        >
          +
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.4, s - 0.1))}
          className="w-7 h-7 bg-[#1a1f2e] border border-[#374151] text-white rounded text-sm hover:bg-[#2a2f3e]"
        >
          −
        </button>
        <button
          onClick={() => {
            setPan({ x: 0, y: 0 });
            setScale(1);
          }}
          className="w-7 h-7 bg-[#1a1f2e] border border-[#374151] text-white rounded text-xs hover:bg-[#2a2f3e]"
        >
          ⌂
        </button>
      </div>
    </div>
  );
}
