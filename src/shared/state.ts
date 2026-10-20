import type { ActionRun, Agent, MeshDm, MeshState, Run, Topic, Workspace } from './model.js';

export interface StateSnapshot {
  lastEventId: string | null;
  workspaces: Workspace[];
  topics: Topic[];
  runs: Run[];
  agents: Agent[];
  actions: ActionRun[];
  /** présent seulement quand `mesh.cell` est configuré (chantier 12) */
  mesh?: { state: MeshState; inbox: MeshDm[] };
}
