import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database;

export function initDatabase(dbPath?: string): Database.Database {
  const databasePath = dbPath || path.join(process.cwd(), 'workflow.db');
  db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  return db;
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flow_definitions (
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      definition_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (id, version)
    );

    CREATE TABLE IF NOT EXISTS flow_instances (
      id TEXT PRIMARY KEY,
      definition_id TEXT NOT NULL,
      definition_version INTEGER NOT NULL,
      definition_snapshot TEXT NOT NULL,
      initiator TEXT NOT NULL,
      status TEXT NOT NULL,
      form_data TEXT NOT NULL,
      current_node_ids TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      assignee TEXT NOT NULL,
      status TEXT NOT NULL,
      comment TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history_records (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      node_name TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      comment TEXT,
      timestamp INTEGER NOT NULL,
      detail TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_instance ON tasks(instance_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
    CREATE INDEX IF NOT EXISTS idx_history_instance ON history_records(instance_id);
    CREATE INDEX IF NOT EXISTS idx_instances_definition ON flow_instances(definition_id);
  `);
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}
