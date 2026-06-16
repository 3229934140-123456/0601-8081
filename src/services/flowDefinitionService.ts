import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';
import {
  FlowDefinition,
  FlowNode,
  NodeType,
  ApprovalMode,
  ExclusiveBranch,
  ReturnTarget
} from '../types';

export class FlowDefinitionService {
  createDefinition(
    name: string,
    nodes: FlowNode[],
    edges: { source: string; target: string }[],
    startNodeId: string,
    endNodeId: string
  ): FlowDefinition {
    const db = getDb();
    const id = uuidv4();
    const version = 1;
    const now = Date.now();

    const definition: FlowDefinition = {
      id,
      name,
      version,
      nodes,
      edges,
      startNodeId,
      endNodeId,
      createdAt: now,
      isActive: true
    };

    const stmt = db.prepare(`
      INSERT INTO flow_definitions (id, name, version, definition_json, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, version, JSON.stringify(definition), 1, now);

    return definition;
  }

  createNewVersion(
    definitionId: string,
    nodes: FlowNode[],
    edges: { source: string; target: string }[],
    startNodeId: string,
    endNodeId: string
  ): FlowDefinition | null {
    const db = getDb();
    const current = this.getLatestVersion(definitionId);
    if (!current) return null;

    const newVersion = current.version + 1;
    const now = Date.now();

    const definition: FlowDefinition = {
      id: definitionId,
      name: current.name,
      version: newVersion,
      nodes,
      edges,
      startNodeId,
      endNodeId,
      createdAt: now,
      isActive: true
    };

    const updateStmt = db.prepare(`
      UPDATE flow_definitions SET is_active = 0 WHERE id = ? AND version = ?
    `);
    updateStmt.run(definitionId, current.version);

    const insertStmt = db.prepare(`
      INSERT INTO flow_definitions (id, name, version, definition_json, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(definitionId, current.name, newVersion, JSON.stringify(definition), 1, now);

    return definition;
  }

  getDefinition(id: string, version?: number): FlowDefinition | null {
    const db = getDb();
    let stmt;
    if (version !== undefined) {
      stmt = db.prepare(`
        SELECT definition_json FROM flow_definitions WHERE id = ? AND version = ?
      `);
      const row = stmt.get(id, version) as { definition_json: string } | undefined;
      return row ? JSON.parse(row.definition_json) : null;
    } else {
      return this.getLatestVersion(id);
    }
  }

  getLatestVersion(id: string): FlowDefinition | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT definition_json FROM flow_definitions WHERE id = ? ORDER BY version DESC LIMIT 1
    `);
    const row = stmt.get(id) as { definition_json: string } | undefined;
    return row ? JSON.parse(row.definition_json) : null;
  }

  listDefinitions(): FlowDefinition[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT definition_json FROM flow_definitions WHERE is_active = 1 ORDER BY created_at DESC
    `);
    const rows = stmt.all() as { definition_json: string }[];
    return rows.map(row => JSON.parse(row.definition_json));
  }

  getNodeById(definition: FlowDefinition, nodeId: string): FlowNode | undefined {
    return definition.nodes.find(n => n.id === nodeId);
  }

  getNextNodes(definition: FlowDefinition, nodeId: string): FlowNode[] {
    const nextNodeIds = definition.edges
      .filter(e => e.source === nodeId)
      .map(e => e.target);
    return definition.nodes.filter(n => nextNodeIds.includes(n.id));
  }

  getPreviousNodes(definition: FlowDefinition, nodeId: string): FlowNode[] {
    const prevNodeIds = definition.edges
      .filter(e => e.target === nodeId)
      .map(e => e.source);
    return definition.nodes.filter(n => prevNodeIds.includes(n.id));
  }

  evaluateCondition(condition: string, formData: Record<string, any>): boolean {
    try {
      const fn = new Function('data', `with (data) { return ${condition}; }`);
      return fn(formData) === true;
    } catch (e) {
      return false;
    }
  }

  getExclusiveBranch(definition: FlowDefinition, nodeId: string, formData: Record<string, any>): string[] | null {
    const node = this.getNodeById(definition, nodeId);
    if (!node || node.type !== NodeType.EXCLUSIVE) return null;

    const config = node.config as { branches: ExclusiveBranch[]; defaultBranch: string };
    for (const branch of config.branches) {
      if (this.evaluateCondition(branch.condition, formData)) {
        return branch.nodeIds;
      }
    }
    return [config.defaultBranch];
  }
}

export const flowDefinitionService = new FlowDefinitionService();
