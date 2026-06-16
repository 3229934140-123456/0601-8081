import { initDatabase } from './database';
import { flowDefinitionService } from './services/flowDefinitionService';
import { flowInstanceService } from './services/flowInstanceService';
import { taskService } from './services/taskService';
import { historyService } from './services/historyService';
import { migrationService } from './services/migrationService';
import {
  NodeType,
  ApprovalMode,
  ReturnTarget,
  InstanceStatus,
  TaskStatus,
  FlowDefinition,
  FlowNode
} from './types';

function log(title: string, data?: any) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
  if (data !== undefined) {
    console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }
}

function createSerialApprovalDefinition(): FlowDefinition {
  const nodes: FlowNode[] = [
    { id: 'start', type: NodeType.START, name: '开始' },
    {
      id: 'dept_approval',
      type: NodeType.APPROVAL,
      name: '部门经理审批',
      config: {
        assignees: ['manager_a'],
        mode: ApprovalMode.ONE,
        returnTarget: ReturnTarget.INITIATOR
      }
    },
    {
      id: 'hr_approval',
      type: NodeType.APPROVAL,
      name: 'HR审批',
      config: {
        assignees: ['hr_1', 'hr_2'],
        mode: ApprovalMode.ANY,
        returnTarget: ReturnTarget.PREVIOUS
      }
    },
    {
      id: 'director_approval',
      type: NodeType.APPROVAL,
      name: '总监审批',
      config: {
        assignees: ['director'],
        mode: ApprovalMode.ONE,
        returnTarget: ReturnTarget.INITIATOR
      }
    },
    { id: 'end', type: NodeType.END, name: '结束' }
  ];

  const edges = [
    { source: 'start', target: 'dept_approval' },
    { source: 'dept_approval', target: 'hr_approval' },
    { source: 'hr_approval', target: 'director_approval' },
    { source: 'director_approval', target: 'end' }
  ];

  return flowDefinitionService.createDefinition(
    '员工请假审批(串行)',
    nodes,
    edges,
    'start',
    'end'
  );
}

function createParallelApprovalDefinition(): FlowDefinition {
  const nodes: FlowNode[] = [
    { id: 'start', type: NodeType.START, name: '开始' },
    {
      id: 'dept_approval',
      type: NodeType.APPROVAL,
      name: '部门经理审批',
      config: {
        assignees: ['manager_a'],
        mode: ApprovalMode.ONE
      }
    },
    {
      id: 'parallel_sign',
      type: NodeType.PARALLEL,
      name: '财务与法务会签',
      config: {
        mode: ApprovalMode.ALL,
        branches: [
          ['finance_approval'],
          ['legal_approval']
        ]
      }
    },
    {
      id: 'finance_approval',
      type: NodeType.APPROVAL,
      name: '财务审批',
      config: {
        assignees: ['finance_1', 'finance_2'],
        mode: ApprovalMode.ALL
      }
    },
    {
      id: 'legal_approval',
      type: NodeType.APPROVAL,
      name: '法务审批',
      config: {
        assignees: ['legal_1', 'legal_2'],
        mode: ApprovalMode.ALL
      }
    },
    {
      id: 'ceo_approval',
      type: NodeType.APPROVAL,
      name: 'CEO审批',
      config: {
        assignees: ['ceo'],
        mode: ApprovalMode.ONE
      }
    },
    { id: 'end', type: NodeType.END, name: '结束' }
  ];

  const edges = [
    { source: 'start', target: 'dept_approval' },
    { source: 'dept_approval', target: 'parallel_sign' },
    { source: 'parallel_sign', target: 'ceo_approval' },
    { source: 'ceo_approval', target: 'end' }
  ];

  return flowDefinitionService.createDefinition(
    '采购合同审批(会签+或签)',
    nodes,
    edges,
    'start',
    'end'
  );
}

function createConditionalApprovalDefinition(): FlowDefinition {
  const nodes: FlowNode[] = [
    { id: 'start', type: NodeType.START, name: '开始' },
    {
      id: 'dept_approval',
      type: NodeType.APPROVAL,
      name: '部门经理审批',
      config: {
        assignees: ['manager_a'],
        mode: ApprovalMode.ONE
      }
    },
    {
      id: 'amount_gateway',
      type: NodeType.EXCLUSIVE,
      name: '金额判断',
      config: {
        branches: [
          {
            condition: 'amount <= 1000',
            nodeIds: ['finance_low']
          },
          {
            condition: 'amount > 1000 && amount <= 10000',
            nodeIds: ['finance_mid']
          },
          {
            condition: 'amount > 10000 && amount <= 100000',
            nodeIds: ['finance_high']
          }
        ],
        defaultBranch: 'finance_high'
      }
    },
    {
      id: 'finance_low',
      type: NodeType.APPROVAL,
      name: '财务专员审批',
      config: {
        assignees: ['finance_junior'],
        mode: ApprovalMode.ONE
      }
    },
    {
      id: 'finance_mid',
      type: NodeType.APPROVAL,
      name: '财务主管审批',
      config: {
        assignees: ['finance_senior'],
        mode: ApprovalMode.ONE
      }
    },
    {
      id: 'finance_high',
      type: NodeType.APPROVAL,
      name: '财务总监审批',
      config: {
        assignees: ['finance_director'],
        mode: ApprovalMode.ONE
      }
    },
    { id: 'end', type: NodeType.END, name: '结束' }
  ];

  const edges = [
    { source: 'start', target: 'dept_approval' },
    { source: 'dept_approval', target: 'amount_gateway' },
    { source: 'amount_gateway', target: 'finance_low' },
    { source: 'amount_gateway', target: 'finance_mid' },
    { source: 'amount_gateway', target: 'finance_high' },
    { source: 'finance_low', target: 'end' },
    { source: 'finance_mid', target: 'end' },
    { source: 'finance_high', target: 'end' }
  ];

  return flowDefinitionService.createDefinition(
    '费用报销审批(条件分支)',
    nodes,
    edges,
    'start',
    'end'
  );
}

function demoSerialApproval() {
  log('【Demo 1】串行审批流程 - 员工请假');

  const definition = createSerialApprovalDefinition();
  log('创建的流程定义', { id: definition.id, name: definition.name, version: definition.version });

  const instance = flowInstanceService.startInstance(
    definition.id,
    'employee_zhang',
    { reason: '家里有事', days: 3 }
  );
  log('发起审批实例', {
    instanceId: instance!.id,
    status: instance!.status,
    currentNodes: instance!.currentNodeIds
  });

  const tasks1 = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  log('部门经理的待办任务', tasks1.map(t => ({ id: t.id, node: t.nodeId, status: t.status })));

  const inst1 = flowInstanceService.approveTask(tasks1[0].id, 'manager_a', '同意请假');
  log('部门经理审批通过后', {
    status: inst1!.status,
    currentNodes: inst1!.currentNodeIds
  });

  const tasks2 = taskService.getTasksByAssignee('hr_1', TaskStatus.PENDING);
  log('HR_1的待办任务', tasks2.map(t => ({ id: t.id, node: t.nodeId })));

  const tasks3 = taskService.getTasksByAssignee('hr_2', TaskStatus.PENDING);
  log('HR_2的待办任务', tasks3.map(t => ({ id: t.id, node: t.nodeId })));

  const inst2 = flowInstanceService.approveTask(tasks2[0].id, 'hr_1', 'HR批准');
  log('HR_1审批通过(或签模式 - 一人通过即可)', {
    status: inst2!.status,
    currentNodes: inst2!.currentNodeIds
  });

  const hr2After = taskService.getTasksByAssignee('hr_2', TaskStatus.PENDING);
  log('HR_2的待办是否被取消', hr2After.length === 0 ? '是 - 已自动取消' : '否 - 仍有' + hr2After.length + '条待办');

  const tasks4 = taskService.getTasksByAssignee('director', TaskStatus.PENDING);
  log('总监的待办任务', tasks4.map(t => ({ id: t.id, node: t.nodeId })));

  const inst3 = flowInstanceService.approveTask(tasks4[0].id, 'director', '总监批准');
  log('总监审批通过后', {
    status: inst3!.status,
    currentNodes: inst3!.currentNodeIds
  });

  const history = historyService.getHistoryByInstanceId(instance!.id);
  log('审批历史记录', history.map(h => ({
    node: h.nodeName,
    actor: h.actor,
    action: h.action,
    comment: h.comment
  })));

  return definition;
}

function demoParallelApproval() {
  log('【Demo 2】并行会签流程 - 采购合同审批');

  const definition = createParallelApprovalDefinition();
  log('创建的流程定义', { id: definition.id, name: definition.name });

  const instance = flowInstanceService.startInstance(
    definition.id,
    'buyer_li',
    { item: '办公电脑', amount: 50000 }
  );
  log('发起采购审批', { instanceId: instance!.id, currentNodes: instance!.currentNodeIds });

  let tasks = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTask = tasks.find(t => t.instanceId === instance!.id)!;
  flowInstanceService.approveTask(mgrTask.id, 'manager_a', '同意采购');
  log('部门经理审批通过，进入会签阶段');

  const financeTasks = taskService.getTasksByAssignee('finance_1', TaskStatus.PENDING);
  log('财务1的待办(会签模式)', financeTasks.map(t => ({ id: t.id, node: t.nodeId })));

  const legalTasks = taskService.getTasksByAssignee('legal_1', TaskStatus.PENDING);
  log('法务1的待办(会签模式)', legalTasks.map(t => ({ id: t.id, node: t.nodeId })));

  flowInstanceService.approveTask(financeTasks[0].id, 'finance_1', '财务1通过');
  log('财务1审批通过 - 会签需全部通过，因此流程不继续');

  let currentInstance = flowInstanceService.getInstance(instance!.id)!;
  log('当前实例状态', { currentNodes: currentInstance.currentNodeIds, status: currentInstance.status });

  const financeTasks2 = taskService.getTasksByAssignee('finance_2', TaskStatus.PENDING);
  flowInstanceService.approveTask(financeTasks2[0].id, 'finance_2', '财务2通过');
  log('财务2也通过了 - 财务分支完成');

  flowInstanceService.approveTask(legalTasks[0].id, 'legal_1', '法务1通过');
  log('法务1通过 - 会签还未全部完成');

  const legalTasks2 = taskService.getTasksByAssignee('legal_2', TaskStatus.PENDING);
  flowInstanceService.approveTask(legalTasks2[0].id, 'legal_2', '法务2通过');
  log('法务2通过 - 所有会签完成，进入CEO审批');

  currentInstance = flowInstanceService.getInstance(instance!.id)!;
  log('会签全部完成后', { currentNodes: currentInstance.currentNodeIds, status: currentInstance.status });

  const ceoTasks = taskService.getTasksByAssignee('ceo', TaskStatus.PENDING);
  flowInstanceService.approveTask(ceoTasks[0].id, 'ceo', 'CEO批准');
  log('CEO审批通过');

  currentInstance = flowInstanceService.getInstance(instance!.id)!;
  log('最终结果', { status: currentInstance.status, currentNodes: currentInstance.currentNodeIds });

  const history = historyService.getHistoryByInstanceId(instance!.id);
  log('完整审批历史', history.map(h => `${h.nodeName} - ${h.actor} - ${h.action}`));

  return definition;
}

function demoConditionalBranching() {
  log('【Demo 3】条件分支流程 - 费用报销');

  const definition = createConditionalApprovalDefinition();
  log('创建的流程定义', { id: definition.id, name: definition.name });

  log('--- 场景1: 小额报销 500元 ---');
  const instance1 = flowInstanceService.startInstance(
    definition.id,
    'employee_wang',
    { amount: 500, reason: '办公用品' }
  );

  let tasks = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTask1 = tasks.find(t => t.instanceId === instance1!.id)!;
  flowInstanceService.approveTask(mgrTask1.id, 'manager_a', '同意');

  let inst = flowInstanceService.getInstance(instance1!.id)!;
  log('500元报销 - 部门经理通过后走向', { currentNodes: inst.currentNodeIds });

  const juniorTasks = taskService.getTasksByAssignee('finance_junior', TaskStatus.PENDING);
  log('财务专员是否有待办', juniorTasks.length > 0 ? '是 - 财务专员审批' : '否');
  flowInstanceService.approveTask(juniorTasks[0].id, 'finance_junior', '同意报销');

  inst = flowInstanceService.getInstance(instance1!.id)!;
  log('500元报销 - 最终状态', { status: inst.status });

  log('--- 场景2: 中额报销 5000元 ---');
  const instance2 = flowInstanceService.startInstance(
    definition.id,
    'employee_chen',
    { amount: 5000, reason: '出差费用' }
  );

  tasks = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTask = tasks.find(t => t.instanceId === instance2!.id)!;
  flowInstanceService.approveTask(mgrTask.id, 'manager_a', '同意');

  inst = flowInstanceService.getInstance(instance2!.id)!;
  log('5000元报销 - 部门经理通过后走向', { currentNodes: inst.currentNodeIds });

  const seniorTasks = taskService.getTasksByAssignee('finance_senior', TaskStatus.PENDING);
  log('财务主管是否有待办', seniorTasks.length > 0 ? '是 - 财务主管审批' : '否');

  log('--- 场景3: 大额报销 50000元 ---');
  const instance3 = flowInstanceService.startInstance(
    definition.id,
    'employee_liu',
    { amount: 50000, reason: '客户招待' }
  );

  tasks = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTask3 = tasks.find(t => t.instanceId === instance3!.id)!;
  flowInstanceService.approveTask(mgrTask3.id, 'manager_a', '同意');

  inst = flowInstanceService.getInstance(instance3!.id)!;
  log('50000元报销 - 部门经理通过后走向', { currentNodes: inst.currentNodeIds });

  const directorTasks = taskService.getTasksByAssignee('finance_director', TaskStatus.PENDING);
  log('财务总监是否有待办', directorTasks.length > 0 ? '是 - 财务总监审批' : '否');

  return definition;
}

function demoReturnAndWithdraw() {
  log('【Demo 4】退回与撤回功能');

  const definition = createSerialApprovalDefinition();

  log('--- 场景1: 退回到发起人 ---');
  const instance1 = flowInstanceService.startInstance(
    definition.id,
    'employee_zhao',
    { reason: '旅游', days: 10 }
  );

  let tasks = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTask1 = tasks.find(t => t.instanceId === instance1!.id)!;
  log('部门经理收到待办', 1);

  const inst1 = flowInstanceService.returnTask(
    mgrTask1.id,
    'manager_a',
    '请假理由不充分，请补充',
    'start'
  );
  log('部门经理退回给发起人', {
    status: inst1!.status,
    currentNodes: inst1!.currentNodeIds
  });

  const history1 = historyService.getHistoryByInstanceId(instance1!.id);
  log('退回后的历史', history1.map(h => `${h.nodeName} - ${h.action}`));

  log('--- 场景2: 转交功能 ---');
  const instance2 = flowInstanceService.startInstance(
    definition.id,
    'employee_sun',
    { reason: '培训', days: 2 }
  );

  tasks = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTask2 = tasks.find(t => t.instanceId === instance2!.id)!;

  const inst2 = flowInstanceService.transferTask(
    mgrTask2.id,
    'manager_a',
    'manager_b',
    '我出差了，帮我审批一下'
  );
  log('manager_a 转交给 manager_b', { status: inst2!.status });

  const originalTask = taskService.getTaskById(mgrTask2.id);
  log('原任务状态', { id: mgrTask2.id, assignee: originalTask!.assignee, status: originalTask!.status });

  const tasksOfB = taskService.getTasksByAssignee('manager_b', TaskStatus.PENDING);
  log('manager_b的待办任务', tasksOfB.filter(t => t.instanceId === instance2!.id).map(t => ({ id: t.id, assignee: t.assignee, status: t.status })));

  flowInstanceService.approveTask(tasksOfB[0].id, 'manager_b', '代为审批通过');
  log('manager_b 审批通过后');

  const inst2After = flowInstanceService.getInstance(instance2!.id)!;
  log('转交审批后流程状态', { currentNodes: inst2After.currentNodeIds, status: inst2After.status });

  log('--- 场景3: 发起人撤回 ---');
  const instance3 = flowInstanceService.startInstance(
    definition.id,
    'employee_zhou',
    { reason: '私事', days: 5 }
  );

  const inst3 = flowInstanceService.withdrawInstance(
    instance3!.id,
    'employee_zhou',
    '暂时不请假了'
  );
  log('发起人撤回后', { status: inst3!.status, currentNodes: inst3!.currentNodeIds });

  return definition;
}

function demoMigration() {
  log('【Demo 5】流程改版与实例迁移');

  const v1Nodes: FlowNode[] = [
    { id: 'start', type: NodeType.START, name: '开始' },
    {
      id: 'dept_approval',
      type: NodeType.APPROVAL,
      name: '部门经理审批',
      config: { assignees: ['manager_a'], mode: ApprovalMode.ONE }
    },
    {
      id: 'hr_approval',
      type: NodeType.APPROVAL,
      name: 'HR审批',
      config: { assignees: ['hr_1'], mode: ApprovalMode.ONE }
    },
    { id: 'end', type: NodeType.END, name: '结束' }
  ];

  const v1Edges = [
    { source: 'start', target: 'dept_approval' },
    { source: 'dept_approval', target: 'hr_approval' },
    { source: 'hr_approval', target: 'end' }
  ];

  const def = flowDefinitionService.createDefinition(
    '离职审批',
    v1Nodes,
    v1Edges,
    'start',
    'end'
  );
  log('创建V1版本流程', { id: def.id, version: def.version });

  const inst1 = flowInstanceService.startInstance(def.id, 'emp_1', { reason: '个人发展' });
  const inst2 = flowInstanceService.startInstance(def.id, 'emp_2', { reason: '薪资问题' });
  log('发起两个在途实例', [inst1!.id, inst2!.id]);

  let inst1Tasks = taskService.getTasksByInstanceId(inst1!.id);
  let deptTask = inst1Tasks.find(t => t.nodeId === 'dept_approval' && t.status === TaskStatus.PENDING);
  if (deptTask) {
    flowInstanceService.approveTask(deptTask.id, 'manager_a', '同意');
  }
  log('第一个实例 - 部门经理已通过，当前在HR审批');

  const inst1Detail = flowInstanceService.getInstance(inst1!.id)!;
  log('实例1当前状态', { version: inst1Detail.definitionVersion, currentNodes: inst1Detail.currentNodeIds });

  const v2Nodes: FlowNode[] = [
    { id: 'start', type: NodeType.START, name: '开始' },
    {
      id: 'dept_approval',
      type: NodeType.APPROVAL,
      name: '部门经理审批',
      config: { assignees: ['manager_a'], mode: ApprovalMode.ONE }
    },
    {
      id: 'hr_approval',
      type: NodeType.APPROVAL,
      name: 'HR审批',
      config: { assignees: ['hr_1', 'hr_2'], mode: ApprovalMode.ALL }
    },
    {
      id: 'it_approval',
      type: NodeType.APPROVAL,
      name: 'IT资产交接',
      config: { assignees: ['it_admin'], mode: ApprovalMode.ONE }
    },
    {
      id: 'finance_approval',
      type: NodeType.APPROVAL,
      name: '财务结算',
      config: { assignees: ['finance_1'], mode: ApprovalMode.ONE }
    },
    { id: 'end', type: NodeType.END, name: '结束' }
  ];

  const v2Edges = [
    { source: 'start', target: 'dept_approval' },
    { source: 'dept_approval', target: 'hr_approval' },
    { source: 'hr_approval', target: 'it_approval' },
    { source: 'it_approval', target: 'finance_approval' },
    { source: 'finance_approval', target: 'end' }
  ];

  const v2Def = flowDefinitionService.createNewVersion(
    def.id,
    v2Nodes,
    v2Edges,
    'start',
    'end'
  );
  log('发布V2版本(新增IT交接和财务结算环节)', { version: v2Def!.version });

  const runningInstances = migrationService.getRunningInstances(def.id);
  log('当前在途实例数', runningInstances.length);

  log('--- 策略1: current_node_only (仅保留当前节点) ---');
  const migrated1 = migrationService.migrateInstance(
    inst1!.id,
    v2Def!.version,
    'current_node_only',
    'admin'
  );
  log('实例1迁移结果', {
    success: !!migrated1,
    newVersion: migrated1?.definitionVersion,
    currentNodes: migrated1?.currentNodeIds
  });

  const hrTasksAfter = taskService.getTasksByAssignee('hr_1', TaskStatus.PENDING);
  const hrTasksOfInst1 = hrTasksAfter.filter(t => t.instanceId === inst1!.id);
  log('迁移后HR_1是否还有待办', hrTasksOfInst1.length > 0 ? '是 - 任务保留' : '否');

  log('--- 策略2: full_restart (从头开始) ---');
  const migrated2 = migrationService.migrateInstance(
    inst2!.id,
    v2Def!.version,
    'full_restart',
    'admin'
  );
  log('实例2迁移结果', {
    success: !!migrated2,
    newVersion: migrated2?.definitionVersion,
    currentNodes: migrated2?.currentNodeIds
  });

  const mgrTasksAfter = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTasksOfInst2 = mgrTasksAfter.filter(t => t.instanceId === inst2!.id);
  log('迁移后部门经理的待办(实例2)', mgrTasksOfInst2.length > 0 ? '有 - 重新开始' : '无');

  const history = historyService.getHistoryByInstanceId(inst2!.id);
  log('实例2的迁移历史', history.filter(h => h.action.includes('迁移')).map(h => h.action));

  return def;
}

function demoRejectInCountersign() {
  log('【Demo 6】会签场景下的拒绝处理');

  const nodes: FlowNode[] = [
    { id: 'start', type: NodeType.START, name: '开始' },
    {
      id: 'countersign',
      type: NodeType.PARALLEL,
      name: '三人会签',
      config: {
        mode: ApprovalMode.ALL,
        branches: [
          ['approver_1'],
          ['approver_2'],
          ['approver_3']
        ]
      }
    },
    {
      id: 'approver_1',
      type: NodeType.APPROVAL,
      name: '审批人1',
      config: { assignees: ['user_1'], mode: ApprovalMode.ONE }
    },
    {
      id: 'approver_2',
      type: NodeType.APPROVAL,
      name: '审批人2',
      config: { assignees: ['user_2'], mode: ApprovalMode.ONE }
    },
    {
      id: 'approver_3',
      type: NodeType.APPROVAL,
      name: '审批人3',
      config: { assignees: ['user_3'], mode: ApprovalMode.ONE }
    },
    { id: 'end', type: NodeType.END, name: '结束' }
  ];

  const edges = [
    { source: 'start', target: 'countersign' },
    { source: 'countersign', target: 'end' }
  ];

  const def = flowDefinitionService.createDefinition(
    '三人会签测试',
    nodes,
    edges,
    'start',
    'end'
  );

  log('创建三人会签流程', { id: def.id });

  const instance = flowInstanceService.startInstance(def.id, 'applicant', { item: '测试' });
  log('发起审批', { instanceId: instance!.id });

  const tasks1 = taskService.getTasksByAssignee('user_1', TaskStatus.PENDING);
  const tasks2 = taskService.getTasksByAssignee('user_2', TaskStatus.PENDING);
  const tasks3 = taskService.getTasksByAssignee('user_3', TaskStatus.PENDING);
  log('三位审批人各有待办', {
    u1: tasks1.length,
    u2: tasks2.length,
    u3: tasks3.length
  });

  flowInstanceService.approveTask(tasks1[0].id, 'user_1', '同意');
  log('user_1 通过');

  let inst = flowInstanceService.getInstance(instance!.id)!;
  log('当前状态', { status: inst.status, currentNodes: inst.currentNodeIds });

  flowInstanceService.rejectTask(tasks2[0].id, 'user_2', '不同意，有问题');
  log('user_2 拒绝 (会签模式: 一人拒绝整体拒绝)');

  inst = flowInstanceService.getInstance(instance!.id)!;
  log('拒绝后整体状态', { status: inst.status });

  const remainingTasks = taskService.getTasksByAssignee('user_3', TaskStatus.PENDING);
  log('user_3的待办是否被取消', remainingTasks.length === 0 ? '是 - 已自动取消' : '否');

  const history = historyService.getHistoryByInstanceId(instance!.id);
  log('审批历史', history.map(h => `${h.nodeName} - ${h.actor} - ${h.action}`));

  return def;
}

function demoParallelAnyMode() {
  log('【Demo 7】并行或签模式 - 任一分支通过即流转');

  const nodes: FlowNode[] = [
    { id: 'start', type: NodeType.START, name: '开始' },
    {
      id: 'dept_approval',
      type: NodeType.APPROVAL,
      name: '部门经理审批',
      config: { assignees: ['manager_a'], mode: ApprovalMode.ONE }
    },
    {
      id: 'parallel_any',
      type: NodeType.PARALLEL,
      name: '多部门审核(或签)',
      config: {
        mode: ApprovalMode.ANY,
        branches: [
          ['hr_review'],
          ['finance_review']
        ]
      }
    },
    {
      id: 'hr_review',
      type: NodeType.APPROVAL,
      name: 'HR审核',
      config: { assignees: ['hr_1'], mode: ApprovalMode.ONE }
    },
    {
      id: 'finance_review',
      type: NodeType.APPROVAL,
      name: '财务审核',
      config: { assignees: ['finance_1'], mode: ApprovalMode.ONE }
    },
    { id: 'end', type: NodeType.END, name: '结束' }
  ];

  const edges = [
    { source: 'start', target: 'dept_approval' },
    { source: 'dept_approval', target: 'parallel_any' },
    { source: 'parallel_any', target: 'end' }
  ];

  const def = flowDefinitionService.createDefinition(
    '并行或签测试',
    nodes,
    edges,
    'start',
    'end'
  );
  log('创建并行或签流程', { id: def.id });

  const instance = flowInstanceService.startInstance(def.id, 'applicant', { item: '并行或签测试' });

  const mgrTasks = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTask = mgrTasks.find(t => t.instanceId === instance!.id)!;
  flowInstanceService.approveTask(mgrTask.id, 'manager_a', '同意');
  log('部门经理通过，进入并行或签阶段');

  let inst = flowInstanceService.getInstance(instance!.id)!;
  log('当前节点(两个分支同时启动)', { currentNodes: inst.currentNodeIds });

  const hrTasks = taskService.getTasksByAssignee('hr_1', TaskStatus.PENDING);
  const financeTasks = taskService.getTasksByAssignee('finance_1', TaskStatus.PENDING);
  log('HR和财务都有待办', { hr: hrTasks.length, finance: financeTasks.length });

  log('--- HR先通过 ---');
  flowInstanceService.approveTask(hrTasks[0].id, 'hr_1', 'HR审核通过');

  inst = flowInstanceService.getInstance(instance!.id)!;
  log('HR通过后实例状态', { status: inst.status, currentNodes: inst.currentNodeIds });

  const financeTasksAfter = taskService.getTasksByAssignee('finance_1', TaskStatus.PENDING);
  log('财务的待办是否被自动取消', financeTasksAfter.length === 0 ? '是 - 并行或签一人通过即完成' : '否');

  const allFinanceTasks = taskService.getTasksByInstanceId(instance!.id).filter(t => t.nodeId === 'finance_review');
  log('财务任务最终状态', allFinanceTasks.map(t => ({ assignee: t.assignee, status: t.status })));

  const history = historyService.getHistoryByInstanceId(instance!.id);
  log('审批历史', history.map(h => `${h.nodeName} - ${h.actor} - ${h.action}`));
}

function demoOperatorCheck() {
  log('【Demo 8】操作人权限校验 - 非任务负责人操作被拒绝');

  const definition = createSerialApprovalDefinition();
  const instance = flowInstanceService.startInstance(
    definition.id,
    'employee_test',
    { reason: '权限测试' }
  );

  const tasks = taskService.getTasksByAssignee('manager_a', TaskStatus.PENDING);
  const mgrTask = tasks.find(t => t.instanceId === instance!.id)!;
  log('部门经理的待办', { taskId: mgrTask.id, assignee: mgrTask.assignee });

  const result = flowInstanceService.approveTask(mgrTask.id, 'someone_else', '冒充审批');
  log('非负责人尝试审批', result === null ? '被拒绝 - 返回null' : '竟然通过了!');

  const taskAfter = taskService.getTaskById(mgrTask.id);
  log('任务仍为pending', taskAfter!.status === TaskStatus.PENDING ? '是 - 状态未变' : '否');

  const normalResult = flowInstanceService.approveTask(mgrTask.id, 'manager_a', '本人审批');
  log('负责人审批', normalResult !== null ? '成功' : '失败');

  const transferResult = flowInstanceService.transferTask(mgrTask.id, 'someone_else', 'manager_b', '冒充转交');
  log('非负责人尝试转交', transferResult === null ? '被拒绝' : '竟然通过了!');

  const returnResult = flowInstanceService.returnTask(mgrTask.id, 'someone_else', '冒充退回');
  log('非负责人尝试退回', returnResult === null ? '被拒绝' : '竟然通过了!');
}

function main() {
  initDatabase(':memory:');

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           工作流审批系统 - 完整功能演示                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    demoSerialApproval();
    demoParallelApproval();
    demoConditionalBranching();
    demoReturnAndWithdraw();
    demoMigration();
    demoRejectInCountersign();
    demoParallelAnyMode();
    demoOperatorCheck();
  } catch (e) {
    console.error('演示出错:', e);
    throw e;
  }

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    所有演示完成!                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n核心特性总结:');
  console.log('  1. 流程定义引擎: 支持开始/审批/并行/排他/结束 五种节点');
  console.log('  2. 串行审批: 按顺序依次流转');
  console.log('  3. 会签(ALL): 所有人通过才通过,一人拒绝即拒绝');
  console.log('  4. 或签(ANY): 一人通过即通过,其余待办自动取消');
  console.log('  5. 并行或签: 任一分支通过即流转,其他分支自动取消');
  console.log('  6. 条件分支: 根据表单数据走不同审批路径');
  console.log('  7. 退回策略: 退回发起人 / 退回上一步 / 指定节点');
  console.log('  8. 转交: 保留原任务记录,新建被转交人任务,历史可追溯');
  console.log('  9. 撤回: 发起人可在审批完成前撤回');
  console.log('  10. 操作人校验: 非任务负责人操作被拒绝');
  console.log('  11. 流程迁移: 三种策略 - 保留当前节点/从头开始/智能迁移');
  console.log('  12. 历史追踪: 完整记录所有操作');
  console.log('');
}

main();
