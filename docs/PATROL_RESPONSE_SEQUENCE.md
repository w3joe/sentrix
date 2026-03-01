# Patrol Response Sequence

Documents the animated behavior triggered when a patrol flag is detected in the sprite view.

## Overview

When the patrol swarm raises a new `PatrolFlag` (polled every 10s via `useFlags()`), a coordinated response sequence plays out in the sprite world. The sequence is driven by a state machine in `usePatrolResponseSequence` hook.

## State Machine

```
IDLE
  │  (new PatrolFlag detected)
  ▼
PATROL_MOVING
  │  (patrol arrives beside flagged agent)
  ▼
SUMMONING
  │  (network + 1 investigator start moving to scene)
  ▼
AT_SCENE
  │  (all responders arrived — wait for case file to appear in DB)
  │  (fallback: 30s timeout)
  ▼
RETURNING
  │  (patrol + network + investigator move back toward superintendent)
  ▼
REPORTING
  │  (all responders stand beside superintendent for 5 seconds)
  ▼
IDLE
```

## Trigger

- Source: `useFlags()` polling `/api/swarm/flags` every 10s
- Detection: `usePatrolFlagNotifications` compares seen flag IDs; fires on newly added flag_ids
- The same flag also triggers the `PatrolAlertBanner` notification UI

## Responder Selection

| Role | Selection rule |
|------|---------------|
| Patrol | Whichever of p1/p2 is closest (Euclidean) to the flagged agent's desk position |
| Investigator | Always f1 |
| Network | Always the single Network node |

## Movement

All entity movement uses existing animation hooks:
- **Patrol**: `usePatrolTargetMovement` — already supports `targetAgentPos` prop; extended with a `superintendentPos` return target
- **Investigator**: `useInvestigatorMovement` — already accepts `targetAgentId`; extended with direct `targetPos` override
- **Network**: `NetworkSprite` — extended to accept optional `targetPos` that overrides roaming

Stand-beside offset: each responder arrives at `{ x: agentDeskX + offsetX, y: agentDeskY + offsetY }` so they cluster around the flagged agent without stacking.

## "Case Report Generated" Signal

Watched via `useCaseFiles()` (polls every 10s). Sequence advances from `AT_SCENE → RETURNING` when:
- A new `CaseFile` entry appears whose `targetAgentId` matches the flagged agent AND `status === 'concluded'`
- OR a 30-second fallback timer expires (whichever comes first)

## Return & Report

All three responders navigate toward `controlRoom.superintendentPos` (coordinates: `800*3, 430*3`).
They hold position for 5 seconds (`REPORTING` phase), then:
- Patrol resumes its waypoint loop (`targetAgentPos = null`)
- Investigator resumes control-room roaming (`targetAgentId = null`)
- Network resumes control-room roaming (`targetPos = null`)

## Key Files

| File | Role |
|------|------|
| `frontend/app/hooks/usePatrolResponseSequence.ts` | Central state machine |
| `frontend/app/hooks/usePatrolFlagNotifications.ts` | Flag detection (existing) |
| `frontend/app/components/CenterPanel/SpriteView/layers/EntityLayer.tsx` | Wires response state into sprites |
| `frontend/app/components/CenterPanel/SpriteView/hooks/usePatrolTargetMovement.ts` | Patrol movement |
| `frontend/app/components/CenterPanel/SpriteView/hooks/useInvestigatorMovement.ts` | Investigator movement |
| `frontend/app/components/CenterPanel/SpriteView/entities/NetworkSprite.tsx` | Network movement |
| `frontend/app/components/CenterPanel/SpriteView/config/roomLayout.ts` | All coordinates |

## Coordinates Reference

All values are pre-scaled (×3 world scale).

| Entity / Position | x | y |
|-------------------|---|---|
| Superintendent | 2400 | 1290 |
| Network home | 2100 | 1260 |
| Investigator f1 home | 2100 | 1410 |
| Investigator f2 home | 2700 | 1410 |
| Control room bounds | 1860–2940 | 1110–1590 |

Stand-beside offsets (relative to flagged agent desk):

| Responder | dx | dy |
|-----------|----|----|
| Patrol | -40 | 0 |
| Investigator | +40 | 0 |
| Network | 0 | -40 |
