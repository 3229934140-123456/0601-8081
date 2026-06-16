import { getDb } from '../database';
import { flowDefinitionService } from './flowDefinitionService';
import { flowInstanceService } from './flowInstanceService';
import { taskService } from './taskService';
import { historyService } from './historyService';
import {
  FlowInstance,
  FlowDefinition,
  FlowNode,
  NodeType,
  MigrationPolicy,
  InstanceStatus,
  TaskStatus
} from '../types';

export class MigrationService {
  getRunningInstances(definitionId: string): FlowInstance[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM flow_instances
      WHERE definition_id = ? AND status = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(definitionId, InstanceStatus.RUNNING) as any[];
    return rows.map(row => this.rowToInstance(row));
  }

  migrateInstance(
    instanceId: string,
    targetVersion: number,
    strategy: 'current_node_only' | 'full_restart' | 'smart_migrate',
    operator: string
  ): FlowInstance | null {
    const instance = flowInstanceService.getInstance(instanceId);
    if (!instance || instance.status !== InstanceStatus.RUNNING) return null;

    const targetDefinition = flowDefinitionService.getDefinition(instance.definitionId, targetVersion);
    if (!targetDefinition) return null;

    const oldDefinition = instance.definitionSnapshot;

    switch (strategy) {
      case 'current_node_only':
        return this.migrateCurrentNodeOnly(instance, targetDefinition, operator);
      case 'full_restart':
        return this.migrateFullRestart(instance, targetDefinition, operator);
      case 'smart_migrate':
        return this.migrateSmart(instance, targetDefinition, operator);
      default:
        return null;
    }
  }

  batchMigrate(
    definitionId: string,
    targetVersion: number,
    strategy: 'current_node_only' | 'full_restart' | 'smart_migrate',
    operator: string
  ): { success: number; failed: number; total: number } {
    const instances = this.getRunningInstances(definitionId);
    let success = 0;
    let failed = 0;

    for (const instance of instances) {
      const result = this.migrateInstance(instance.id, targetVersion, strategy, operator);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed, total: instances.length };
  }

  private migrateCurrentNodeOnly(
    instance: FlowInstance,
    targetDefinition: FlowDefinition,
    operator: string
  ): FlowInstance | null {
    const db = getDb();
    const now = Date.now();

    const currentNodeIds = instance.currentNodeIds;
    const canMigrate = currentNodeIds.every(nodeId =>
      targetDefinition.nodes.some(n => n.id === nodeId)
    );

    if (!canMigrate) {
      return null;
    }

    const stmt = db.prepare(`
      UPDATE flow_instances
      SET definition_version = ?, definition_snapshot = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(targetDefinition.version, JSON.stringify(targetDefinition), now, instance.id);

    historyService.addRecord(
      instance.id,
      currentNodeIds[0] || '',
      '流程迁移',
      operator,
      '迁移(保留当前节点)',
      undefined,
      {
        oldVersion: instance.definitionVersion,
        newVersion: targetDefinition.version,
        strategy: 'current_node_only'
      }
    );

    return flowInstanceService.getInstance(instance.id);
  }

  private migrateFullRestart(
    instance: FlowInstance,
    targetDefinition: FlowDefinition,
    operator: string
  ): FlowInstance | null {
    const db = getDb();
    const now = Date.now();

    taskService.cancelAllPendingTasks(instance.id);

    const stmt = db.prepare(`
      UPDATE flow_instances
      SET definition_version = ?, definition_snapshot = ?, current_node_ids = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      targetDefinition.version,
      JSON.stringify(targetDefinition),
      JSON.stringify([targetDefinition.startNodeId]),
      now,
      instance.id
    );

    historyService.addRecord(
      instance.id,
      targetDefinition.startNodeId,
      '流程迁移',
      operator,
      '迁移(从头开始)',
      undefined,
      {
        oldVersion: instance.definitionVersion,
        newVersion: targetDefinition.version,
        strategy: 'full_restart',
        previousNodes: instance.currentNodeIds
      }
    );

    const updatedInstance = flowInstanceService.getInstance(instance.id);
    if (updatedInstance) {
      this.restartFromStart(updatedInstance, targetDefinition);
    }

    return flowInstanceService.getInstance(instance.id);
  }

  private migrateSmart(
    instance: FlowInstance,
    targetDefinition: FlowDefinition,
    operator: string
  ): FlowInstance | null {
    const db = getDb();
    const now = Date.now();
    const oldDefinition = instance.definitionSnapshot;

    const history = historyService.getHistoryByInstanceId(instance.id);
    const processedNodeIds = [...new Set(history.map(h => h.nodeId))];

    const commonProcessedNodes = processedNodeIds.filter(nodeId =>
      targetDefinition.nodes.some(n => n.id === nodeId)
    );

    let furthestNodeId = targetDefinition.startNodeId;
    let maxOrder = -1;

    for (const nodeId of commonProcessedNodes) {
      const order = this.getNodeOrder(targetDefinition, nodeId);
      if (order > maxOrder) {
        maxOrder = order;
        furthestNodeId = nodeId;
      }
    }

    const currentStillExists = instance.currentNodeIds.every(nodeId =>
      targetDefinition.nodes.some(n => n.id === nodeId)
    );

    let newCurrentNodeIds: string[];
    if (currentStillExists) {
      newCurrentNodeIds = instance.currentNodeIds;
    } else {
      newCurrentNodeIds = [furthestNodeId];
      taskService.cancelAllPendingTasks(instance.id);
    }

    const stmt = db.prepare(`
      UPDATE flow_instances
      SET definition_version = ?, definition_snapshot = ?, current_node_ids = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      targetDefinition.version,
      JSON.stringify(targetDefinition),
      JSON.stringify(newCurrentNodeIds),
      now,
      instance.id
    );

    historyService.addRecord(
      instance.id,
      newCurrentNodeIds[0] || '',
      '流程迁移',
      operator,
      '迁移(智能迁移)',
      undefined,
      {
        oldVersion: instance.definitionVersion,
        newVersion: targetDefinition.version,
        strategy: 'smart_migrate',
        previousNodes: instance.currentNodeIds,
        newCurrentNodes: newCurrentNodeIds
      }
    );

    if (!currentStillExists) {
      const updatedInstance = flowInstanceService.getInstance(instance.id);
      if (updatedInstance) {
        for (const nodeId of newCurrentNodeIds) {
          this.processNodeForMigration(updatedInstance, targetDefinition, nodeId);
        }
      }
    }

    return flowInstanceService.getInstance(instance.id);
  }

  private getNodeOrder(definition: FlowDefinition, nodeId: string): number {
    let order = 0;
    let current = definition.startNodeId;
    const visited = new Set<string>();

    while (current && !visited.has(current)) {
      if (current === nodeId) return order;
      visited.add(current);

      const nextNodes = flowDefinitionService.getNextNodes(definition, current);
      if (nextNodes.length === 0) break;

      current = nextNodes[0].id;
      order++;
    }

    return -1;
  }

  private restartFromStart(instance: FlowInstance, definition: FlowDefinition): void {
    const startNode = flowDefinitionService.getNodeById(definition, definition.startNodeId);
    if (startNode && startNode.type === NodeType.START) {
      const nextNodes = flowDefinitionService.getNextNodes(definition, startNode.id);
      if (nextNodes.length > 0) {
        this.processNodeForMigration(instance, definition, nextNodes[0].id);
      }
    }
  }

  private processNodeForMigration(
    instance: FlowInstance,
    definition: FlowDefinition,
    nodeId: string
  ): void {
    const node = flowDefinitionService.getNodeById(definition, nodeId);
    if (!node) return;

    if (node.type === NodeType.APPROVAL) {
      const config = node.config as any;
      if (config && config.assignees) {
        const existingTasks = taskService.getPendingTasksByNode(instance.id, nodeId);
        if (existingTasks.length === 0) {
          taskService.createTasks(instance.id, node, config.assignees, config.mode);
        }
      }
    }
  }

  private rowToInstance(row: any): FlowInstance {
    return {
      id: row.id,
      definitionId: row.definition_id,
      definitionVersion: row.definition_version,
      definitionSnapshot: JSON.parse(row.definition_snapshot),
      initiator: row.initiator,
      status: row.status as InstanceStatus,
      formData: JSON.parse(row.form_data),
      currentNodeIds: JSON.parse(row.current_node_ids),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const migrationService = new MigrationService();
