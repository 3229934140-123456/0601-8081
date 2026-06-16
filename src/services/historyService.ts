import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';
import { HistoryRecord } from '../types';

export class HistoryService {
  addRecord(
    instanceId: string,
    nodeId: string,
    nodeName: string,
    actor: string,
    action: string,
    comment?: string,
    detail?: Record<string, any>
  ): HistoryRecord {
    const db = getDb();
    const now = Date.now();

    const record: HistoryRecord = {
      id: uuidv4(),
      instanceId,
      nodeId,
      nodeName,
      actor,
      action,
      comment,
      timestamp: now,
      detail
    };

    const stmt = db.prepare(`
      INSERT INTO history_records (id, instance_id, node_id, node_name, actor, action, comment, timestamp, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.id,
      instanceId,
      nodeId,
      nodeName,
      actor,
      action,
      comment || null,
      now,
      detail ? JSON.stringify(detail) : null
    );

    return record;
  }

  getHistoryByInstanceId(instanceId: string): HistoryRecord[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM history_records WHERE instance_id = ? ORDER BY timestamp ASC
    `);
    const rows = stmt.all(instanceId) as any[];
    return rows.map(row => this.rowToRecord(row));
  }

  private rowToRecord(row: any): HistoryRecord {
    return {
      id: row.id,
      instanceId: row.instance_id,
      nodeId: row.node_id,
      nodeName: row.node_name,
      actor: row.actor,
      action: row.action,
      comment: row.comment || undefined,
      timestamp: row.timestamp,
      detail: row.detail ? JSON.parse(row.detail) : undefined
    };
  }
}

export const historyService = new HistoryService();
