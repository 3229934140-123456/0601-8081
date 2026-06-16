import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';
import { flowDefinitionService } from './flowDefinitionService';
import { taskService } from './taskService';
import { historyService } from './historyService';
import {
  FlowInstance,
  InstanceStatus,
  TaskStatus,
  NodeType,
  ApprovalMode,
  FlowNode,
  ApprovalNodeConfig,
  ParallelNodeConfig,
  ReturnTarget,
  FlowDefinition
} from '../types';

export class FlowInstanceService {
  startInstance(
    definitionId: string,
    initiator: string,
    formData: Record<string, any>
  ): FlowInstance | null {
    const db = getDb();
    const definition = flowDefinitionService.getLatestVersion(definitionId);
    if (!definition) return null;

    const now = Date.now();
    const instanceId = uuidv4();

    const instance: FlowInstance = {
      id: instanceId,
      definitionId,
      definitionVersion: definition.version,
      definitionSnapshot: JSON.parse(JSON.stringify(definition)),
      initiator,
      status: InstanceStatus.RUNNING,
      formData,
      currentNodeIds: [definition.startNodeId],
      createdAt: now,
      updatedAt: now
    };

    const stmt = db.prepare(`
      INSERT INTO flow_instances (
        id, definition_id, definition_version, definition_snapshot,
        initiator, status, form_data, current_node_ids, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      instanceId,
      definitionId,
      definition.version,
      JSON.stringify(definition),
      initiator,
      InstanceStatus.RUNNING,
      JSON.stringify(formData),
      JSON.stringify([definition.startNodeId]),
      now,
      now
    );

    historyService.addRecord(
      instanceId,
      definition.startNodeId,
      '开始',
      initiator,
      '发起审批',
      undefined,
      { formData }
    );

    this.enterNode(instanceId, definition.startNodeId);

    return this.getInstance(instanceId);
  }

  getInstance(instanceId: string): FlowInstance | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM flow_instances WHERE id = ?');
    const row = stmt.get(instanceId) as any;
    return row ? this.rowToInstance(row) : null;
  }

  listInstances(initiator?: string, status?: InstanceStatus): FlowInstance[] {
    const db = getDb();
    let query = 'SELECT * FROM flow_instances WHERE 1=1';
    const params: any[] = [];

    if (initiator) {
      query += ' AND initiator = ?';
      params.push(initiator);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => this.rowToInstance(row));
  }

  approveTask(taskId: string, approver: string, comment?: string): FlowInstance | null {
    const task = taskService.getTaskById(taskId);
    if (!task || task.status !== TaskStatus.PENDING) return null;
    if (task.assignee !== approver) return null;

    const instance = this.getInstance(task.instanceId);
    if (!instance || instance.status !== InstanceStatus.RUNNING) return null;

    const definition = instance.definitionSnapshot;
    const node = flowDefinitionService.getNodeById(definition, task.nodeId);
    if (!node) return null;

    taskService.approveTask(taskId, comment);

    historyService.addRecord(
      instance.id,
      task.nodeId,
      node.name,
      approver,
      '通过',
      comment
    );

    const config = node.config as ApprovalNodeConfig;
    const mode = config?.mode || ApprovalMode.ONE;
    const result = taskService.isNodeApprovalComplete(instance.id, node.id, mode);

    if (result.complete && result.result) {
      taskService.cancelTasksForNode(instance.id, node.id);
      this.completeNode(instance.id, node);
    }

    return this.getInstance(instance.id);
  }

  rejectTask(taskId: string, rejector: string, comment?: string): FlowInstance | null {
    const task = taskService.getTaskById(taskId);
    if (!task || task.status !== TaskStatus.PENDING) return null;
    if (task.assignee !== rejector) return null;

    const instance = this.getInstance(task.instanceId);
    if (!instance || instance.status !== InstanceStatus.RUNNING) return null;

    const definition = instance.definitionSnapshot;
    const node = flowDefinitionService.getNodeById(definition, task.nodeId);
    if (!node) return null;

    taskService.rejectTask(taskId, comment);

    historyService.addRecord(
      instance.id,
      task.nodeId,
      node.name,
      rejector,
      '拒绝',
      comment
    );

    const config = node.config as ApprovalNodeConfig;
    const mode = config?.mode || ApprovalMode.ONE;
    const result = taskService.isNodeApprovalComplete(instance.id, node.id, mode);

    if (result.complete && !result.result) {
      taskService.cancelAllPendingTasks(instance.id);
      this.rejectInstance(instance.id, node);
    }

    return this.getInstance(instance.id);
  }

  transferTask(taskId: string, fromUser: string, toUser: string, comment?: string): FlowInstance | null {
    const task = taskService.getTaskById(taskId);
    if (!task || task.status !== TaskStatus.PENDING) return null;
    if (task.assignee !== fromUser) return null;

    const instance = this.getInstance(task.instanceId);
    if (!instance || instance.status !== InstanceStatus.RUNNING) return null;

    const definition = instance.definitionSnapshot;
    const node = flowDefinitionService.getNodeById(definition, task.nodeId);
    if (!node) return null;

    taskService.transferTask(taskId, toUser, comment);

    const newTask = taskService.createSingleTask(instance.id, node.id, toUser);

    historyService.addRecord(
      instance.id,
      task.nodeId,
      node.name,
      fromUser,
      '转交',
      comment,
      { from: fromUser, to: toUser, originalTaskId: taskId, newTaskId: newTask.id }
    );

    return this.getInstance(instance.id);
  }

  returnTask(taskId: string, operator: string, comment?: string, targetNodeId?: string): FlowInstance | null {
    const task = taskService.getTaskById(taskId);
    if (!task || task.status !== TaskStatus.PENDING) return null;
    if (task.assignee !== operator) return null;

    const instance = this.getInstance(task.instanceId);
    if (!instance || instance.status !== InstanceStatus.RUNNING) return null;

    const definition = instance.definitionSnapshot;
    const currentNode = flowDefinitionService.getNodeById(definition, task.nodeId);
    if (!currentNode) return null;

    const config = currentNode.config as ApprovalNodeConfig;
    const returnTarget = config?.returnTarget || ReturnTarget.PREVIOUS;

    let returnToNodeId: string | null = null;

    if (targetNodeId) {
      returnToNodeId = targetNodeId;
    } else if (returnTarget === ReturnTarget.INITIATOR) {
      returnToNodeId = definition.startNodeId;
    } else if (returnTarget === ReturnTarget.SPECIFIC && config.returnNodeId) {
      returnToNodeId = config.returnNodeId;
    } else {
      const prevNodes = flowDefinitionService.getPreviousNodes(definition, currentNode.id);
      const approvalNodes = prevNodes.filter(n =>
        n.type === NodeType.APPROVAL || n.type === NodeType.PARALLEL || n.type === NodeType.EXCLUSIVE
      );
      if (approvalNodes.length > 0) {
        returnToNodeId = approvalNodes[0].id;
      } else {
        returnToNodeId = definition.startNodeId;
      }
    }

    if (!returnToNodeId) return null;

    taskService.cancelAllPendingTasks(instance.id);

    historyService.addRecord(
      instance.id,
      currentNode.id,
      currentNode.name,
      operator,
      '退回',
      comment,
      { targetNodeId: returnToNodeId }
    );

    this.setCurrentNodes(instance.id, [returnToNodeId]);
    this.enterNode(instance.id, returnToNodeId);

    return this.getInstance(instance.id);
  }

  withdrawInstance(instanceId: string, withdrawer: string, comment?: string): FlowInstance | null {
    const instance = this.getInstance(instanceId);
    if (!instance || instance.status !== InstanceStatus.RUNNING) return null;

    if (instance.initiator !== withdrawer) return null;

    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE flow_instances SET status = ?, current_node_ids = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(InstanceStatus.WITHDRAWN, JSON.stringify([]), now, instanceId);

    taskService.cancelAllPendingTasks(instanceId);

    historyService.addRecord(
      instanceId,
      instance.currentNodeIds[0] || '',
      '撤回',
      withdrawer,
      '撤回',
      comment
    );

    return this.getInstance(instanceId);
  }

  private enterNode(instanceId: string, nodeId: string): void {
    const instance = this.getInstance(instanceId);
    if (!instance) return;

    const definition = instance.definitionSnapshot;
    const node = flowDefinitionService.getNodeById(definition, nodeId);
    if (!node) return;

    if (!instance.currentNodeIds.includes(nodeId)) {
      this.addCurrentNode(instanceId, nodeId);
    }

    switch (node.type) {
      case NodeType.START:
        this.enterStartNode(instanceId, node);
        break;
      case NodeType.APPROVAL:
        this.enterApprovalNode(instanceId, node);
        break;
      case NodeType.PARALLEL:
        this.enterParallelNode(instanceId, node);
        break;
      case NodeType.EXCLUSIVE:
        this.enterExclusiveNode(instanceId, node);
        break;
      case NodeType.END:
        this.enterEndNode(instanceId, node);
        break;
    }
  }

  private enterStartNode(instanceId: string, node: FlowNode): void {
    const instance = this.getInstance(instanceId);
    if (!instance) return;

    const definition = instance.definitionSnapshot;
    const nextNodes = flowDefinitionService.getNextNodes(definition, node.id);
    if (nextNodes.length > 0) {
      this.leaveNode(instanceId, node.id);
      this.enterNode(instanceId, nextNodes[0].id);
    }
  }

  private enterApprovalNode(instanceId: string, node: FlowNode): void {
    const config = node.config as ApprovalNodeConfig;
    if (!config) return;

    taskService.createTasks(instanceId, node, config.assignees, config.mode);

    historyService.addRecord(
      instanceId,
      node.id,
      node.name,
      'system',
      '分配任务',
      undefined,
      { assignees: config.assignees, mode: config.mode }
    );
  }

  private enterParallelNode(instanceId: string, node: FlowNode): void {
    const config = node.config as ParallelNodeConfig;
    if (!config || !config.branches) return;

    this.leaveNode(instanceId, node.id);

    const firstNodes: string[] = [];
    for (const branch of config.branches) {
      if (branch.length > 0) {
        firstNodes.push(branch[0]);
        this.addCurrentNode(instanceId, branch[0]);
      }
    }

    historyService.addRecord(
      instanceId,
      node.id,
      node.name,
      'system',
      '并行开始',
      undefined,
      { branches: config.branches.length, firstNodes, mode: config.mode }
    );

    for (const nodeId of firstNodes) {
      this.enterNode(instanceId, nodeId);
    }
  }

  private enterExclusiveNode(instanceId: string, node: FlowNode): void {
    const instance = this.getInstance(instanceId);
    if (!instance) return;

    const definition = instance.definitionSnapshot;
    const branchNodeIds = flowDefinitionService.getExclusiveBranch(definition, node.id, instance.formData);

    if (branchNodeIds && branchNodeIds.length > 0) {
      this.leaveNode(instanceId, node.id);
      this.addCurrentNode(instanceId, branchNodeIds[0]);

      historyService.addRecord(
        instanceId,
        node.id,
        node.name,
        'system',
        '条件分支',
        undefined,
        { selectedBranch: branchNodeIds[0], formData: instance.formData }
      );

      this.enterNode(instanceId, branchNodeIds[0]);
    }
  }

  private enterEndNode(instanceId: string, node: FlowNode): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE flow_instances SET status = ?, current_node_ids = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(InstanceStatus.APPROVED, JSON.stringify([]), now, instanceId);

    historyService.addRecord(
      instanceId,
      node.id,
      node.name,
      'system',
      '审批通过'
    );
  }

  private completeNode(instanceId: string, completedNode: FlowNode): void {
    const instance = this.getInstance(instanceId);
    if (!instance) return;

    const definition = instance.definitionSnapshot;
    const parentParallel = this.findParentParallel(definition, completedNode.id);

    if (parentParallel) {
      const parallelConfig = parentParallel.config as ParallelNodeConfig;
      const branch = this.findBranchForNode(parentParallel, completedNode.id);
      if (branch) {
        const nodeIndex = branch.indexOf(completedNode.id);
        const isLastInBranch = nodeIndex === branch.length - 1;

        if (isLastInBranch) {
          this.leaveNode(instanceId, completedNode.id);

          const shouldAdvance = parallelConfig.mode === ApprovalMode.ANY
            || this.areAllBranchesComplete(instanceId, parentParallel);

          if (shouldAdvance) {
            if (parallelConfig.mode === ApprovalMode.ANY) {
              this.cancelOtherBranches(instanceId, parentParallel, branch);
            }
            const nextNodes = flowDefinitionService.getNextNodes(definition, parentParallel.id);
            if (nextNodes.length > 0) {
              this.addCurrentNode(instanceId, nextNodes[0].id);
              this.enterNode(instanceId, nextNodes[0].id);
            }
          }
        } else {
          const nextNodeId = branch[nodeIndex + 1];
          this.leaveNode(instanceId, completedNode.id);
          this.addCurrentNode(instanceId, nextNodeId);
          this.enterNode(instanceId, nextNodeId);
        }
      }
    } else {
      this.leaveNode(instanceId, completedNode.id);

      const nextNodes = flowDefinitionService.getNextNodes(definition, completedNode.id);
      if (nextNodes.length > 0) {
        this.addCurrentNode(instanceId, nextNodes[0].id);
        this.enterNode(instanceId, nextNodes[0].id);
      }
    }
  }

  private cancelOtherBranches(
    instanceId: string,
    parallelNode: FlowNode,
    completedBranch: string[]
  ): void {
    const instance = this.getInstance(instanceId);
    if (!instance) return;

    const config = parallelNode.config as ParallelNodeConfig;
    if (!config || !config.branches) return;

    const otherNodeIds: string[] = [];
    for (const branch of config.branches) {
      if (branch === completedBranch) continue;
      for (const nodeId of branch) {
        otherNodeIds.push(nodeId);
      }
    }

    taskService.cancelTasksForNodes(instanceId, otherNodeIds);

    const newCurrentIds = instance.currentNodeIds.filter(id => !otherNodeIds.includes(id));
    this.setCurrentNodes(instanceId, newCurrentIds);

    historyService.addRecord(
      instanceId,
      parallelNode.id,
      parallelNode.name,
      'system',
      '并行或签完成',
      undefined,
      { completedBranch, canceledBranches: config.branches.filter(b => b !== completedBranch).length }
    );
  }

  private leaveNode(instanceId: string, nodeId: string): void {
    const instance = this.getInstance(instanceId);
    if (!instance) return;

    const newIds = instance.currentNodeIds.filter(id => id !== nodeId);
    this.setCurrentNodes(instanceId, newIds);
  }

  private rejectInstance(instanceId: string, node: FlowNode): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE flow_instances SET status = ?, current_node_ids = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(InstanceStatus.REJECTED, JSON.stringify([]), now, instanceId);

    historyService.addRecord(
      instanceId,
      node.id,
      node.name,
      'system',
      '审批拒绝'
    );
  }

  private findParentParallel(definition: FlowDefinition, nodeId: string): FlowNode | null {
    const parallelNodes = definition.nodes.filter(n => n.type === NodeType.PARALLEL);
    for (const pNode of parallelNodes) {
      const config = pNode.config as ParallelNodeConfig;
      if (config && config.branches) {
        for (const branch of config.branches) {
          if (branch.includes(nodeId)) return pNode;
        }
      }
    }
    return null;
  }

  private findBranchForNode(parallelNode: FlowNode, nodeId: string): string[] | null {
    const config = parallelNode.config as ParallelNodeConfig;
    if (!config || !config.branches) return null;

    for (const branch of config.branches) {
      if (branch.includes(nodeId)) return branch;
    }
    return null;
  }

  private areAllBranchesComplete(instanceId: string, parallelNode: FlowNode): boolean {
    const instance = this.getInstance(instanceId);
    if (!instance) return false;

    const config = parallelNode.config as ParallelNodeConfig;
    if (!config || !config.branches) return false;

    for (const branch of config.branches) {
      for (const nodeId of branch) {
        if (instance.currentNodeIds.includes(nodeId)) {
          return false;
        }
        const pendingTasks = taskService.getPendingTasksByNode(instanceId, nodeId);
        if (pendingTasks.length > 0) {
          return false;
        }
      }
    }
    return true;
  }

  private setCurrentNodes(instanceId: string, nodeIds: string[]): void {
    const db = getDb();
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE flow_instances SET current_node_ids = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(JSON.stringify(nodeIds), now, instanceId);
  }

  private addCurrentNode(instanceId: string, nodeId: string): void {
    const instance = this.getInstance(instanceId);
    if (!instance) return;

    if (!instance.currentNodeIds.includes(nodeId)) {
      const newIds = [...instance.currentNodeIds, nodeId];
      this.setCurrentNodes(instanceId, newIds);
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

export const flowInstanceService = new FlowInstanceService();
