import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';
import { Task, TaskStatus, FlowNode, NodeType, ApprovalMode, ApprovalNodeConfig } from '../types';

export class TaskService {
  createTasks(
    instanceId: string,
    node: FlowNode,
    assignees: string[],
    mode: ApprovalMode
  ): Task[] {
    const db = getDb();
    const now = Date.now();
    const tasks: Task[] = [];

    for (const assignee of assignees) {
      const task: Task = {
        id: uuidv4(),
        instanceId,
        nodeId: node.id,
        assignee,
        status: TaskStatus.PENDING,
        createdAt: now,
        updatedAt: now
      };
      tasks.push(task);

      const stmt = db.prepare(`
        INSERT INTO tasks (id, instance_id, node_id, assignee, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(task.id, instanceId, node.id, assignee, TaskStatus.PENDING, now, now);
    }

    return tasks;
  }

  getTaskById(taskId: string): Task | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(taskId) as any;
    return row ? this.rowToTask(row) : null;
  }

  getTasksByInstanceId(instanceId: string): Task[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM tasks WHERE instance_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(instanceId) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  getTasksByAssignee(assignee: string, status?: TaskStatus): Task[] {
    const db = getDb();
    let stmt;
    if (status) {
      stmt = db.prepare('SELECT * FROM tasks WHERE assignee = ? AND status = ? ORDER BY created_at DESC');
      return (stmt.all(assignee, status) as any[]).map(row => this.rowToTask(row));
    } else {
      stmt = db.prepare('SELECT * FROM tasks WHERE assignee = ? ORDER BY created_at DESC');
      return (stmt.all(assignee) as any[]).map(row => this.rowToTask(row));
    }
  }

  getPendingTasksByNode(instanceId: string, nodeId: string): Task[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM tasks WHERE instance_id = ? AND node_id = ? AND status = ?
    `);
    const rows = stmt.all(instanceId, nodeId, TaskStatus.PENDING) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  approveTask(taskId: string, comment?: string): Task | null {
    return this.updateTaskStatus(taskId, TaskStatus.APPROVED, comment);
  }

  rejectTask(taskId: string, comment?: string): Task | null {
    return this.updateTaskStatus(taskId, TaskStatus.REJECTED, comment);
  }

  transferTask(taskId: string, newAssignee: string, comment?: string): Task | null {
    const db = getDb();
    const task = this.getTaskById(taskId);
    if (!task) return null;

    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE tasks SET assignee = ?, status = ?, comment = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(newAssignee, TaskStatus.PENDING, comment || null, now, taskId);

    return {
      ...task,
      assignee: newAssignee,
      status: TaskStatus.PENDING,
      comment: comment || task.comment,
      updatedAt: now
    };
  }

  cancelTasksForNode(instanceId: string, nodeId: string): void {
    const db = getDb();
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE tasks SET status = ?, updated_at = ?
      WHERE instance_id = ? AND node_id = ? AND status = ?
    `);
    stmt.run(TaskStatus.CANCELED, now, instanceId, nodeId, TaskStatus.PENDING);
  }

  cancelAllPendingTasks(instanceId: string): void {
    const db = getDb();
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE tasks SET status = ?, updated_at = ?
      WHERE instance_id = ? AND status = ?
    `);
    stmt.run(TaskStatus.CANCELED, now, instanceId, TaskStatus.PENDING);
  }

  isNodeApprovalComplete(instanceId: string, nodeId: string, mode: ApprovalMode): { complete: boolean; result: boolean } {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT status FROM tasks WHERE instance_id = ? AND node_id = ?
    `);
    const tasks = stmt.all(instanceId, nodeId) as { status: string }[];

    if (tasks.length === 0) {
      return { complete: false, result: false };
    }

    const pendingCount = tasks.filter(t => t.status === TaskStatus.PENDING).length;
    const approvedCount = tasks.filter(t => t.status === TaskStatus.APPROVED).length;
    const rejectedCount = tasks.filter(t => t.status === TaskStatus.REJECTED).length;

    switch (mode) {
      case ApprovalMode.ALL:
        if (rejectedCount > 0) {
          return { complete: true, result: false };
        }
        return { complete: pendingCount === 0, result: pendingCount === 0 };

      case ApprovalMode.ANY:
        if (approvedCount > 0) {
          return { complete: true, result: true };
        }
        if (pendingCount === 0 && rejectedCount > 0) {
          return { complete: true, result: false };
        }
        return { complete: false, result: false };

      case ApprovalMode.ONE:
        return { complete: pendingCount === 0, result: approvedCount > 0 };

      default:
        return { complete: false, result: false };
    }
  }

  private updateTaskStatus(taskId: string, status: TaskStatus, comment?: string): Task | null {
    const db = getDb();
    const task = this.getTaskById(taskId);
    if (!task) return null;

    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE tasks SET status = ?, comment = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(status, comment || null, now, taskId);

    return {
      ...task,
      status,
      comment: comment || task.comment,
      updatedAt: now
    };
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      instanceId: row.instance_id,
      nodeId: row.node_id,
      assignee: row.assignee,
      status: row.status as TaskStatus,
      comment: row.comment || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const taskService = new TaskService();
