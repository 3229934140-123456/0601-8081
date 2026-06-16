export enum NodeType {
  START = 'start',
  APPROVAL = 'approval',
  PARALLEL = 'parallel',
  EXCLUSIVE = 'exclusive',
  END = 'end'
}

export enum ApprovalMode {
  ALL = 'all',
  ANY = 'any',
  ONE = 'one'
}

export enum TaskStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  TRANSFERRED = 'transferred',
  CANCELED = 'canceled'
}

export enum InstanceStatus {
  RUNNING = 'running',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn'
}

export enum ReturnTarget {
  PREVIOUS = 'previous',
  INITIATOR = 'initiator',
  SPECIFIC = 'specific'
}

export interface FlowNode {
  id: string;
  type: NodeType;
  name: string;
  config?: ApprovalNodeConfig | ParallelNodeConfig | ExclusiveNodeConfig;
}

export interface ApprovalNodeConfig {
  assignees: string[];
  mode: ApprovalMode;
  returnTarget?: ReturnTarget;
  returnNodeId?: string;
}

export interface ParallelNodeConfig {
  mode: ApprovalMode;
  branches: string[][];
}

export interface ExclusiveNodeConfig {
  branches: ExclusiveBranch[];
  defaultBranch: string;
}

export interface ExclusiveBranch {
  condition: string;
  nodeIds: string[];
}

export interface FlowEdge {
  source: string;
  target: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  version: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  startNodeId: string;
  endNodeId: string;
  createdAt: number;
  isActive: boolean;
}

export interface FlowInstance {
  id: string;
  definitionId: string;
  definitionVersion: number;
  definitionSnapshot: FlowDefinition;
  initiator: string;
  status: InstanceStatus;
  formData: Record<string, any>;
  currentNodeIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  instanceId: string;
  nodeId: string;
  assignee: string;
  status: TaskStatus;
  comment?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryRecord {
  id: string;
  instanceId: string;
  nodeId: string;
  nodeName: string;
  actor: string;
  action: string;
  comment?: string;
  timestamp: number;
  detail?: Record<string, any>;
}

export interface MigrationPolicy {
  type: 'keep_old' | 'migrate' | 'manual';
  migrateStrategy?: 'current_node_only' | 'full_restart' | 'smart_migrate';
}
