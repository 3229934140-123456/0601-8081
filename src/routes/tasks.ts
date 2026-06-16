import { Router, Request, Response } from 'express';
import { taskService } from '../services/taskService';
import { flowInstanceService } from '../services/flowInstanceService';
import { TaskStatus } from '../types';

const router = Router();

function classifyError(taskId: string, operator: string, action: string): string | null {
  const task = taskService.getTaskById(taskId);
  if (!task) return '任务不存在';
  if (task.status !== TaskStatus.PENDING) return `任务已${task.status}，无法${action}`;
  if (task.assignee !== operator) return `无权操作：当前任务负责人为 ${task.assignee}，非 ${operator}`;
  return null;
}

router.get('/', (req: Request, res: Response) => {
  try {
    const { assignee, status, instanceId } = req.query;

    let tasks;
    if (instanceId) {
      tasks = taskService.getTasksByInstanceId(instanceId as string);
    } else if (assignee) {
      tasks = taskService.getTasksByAssignee(
        assignee as string,
        status as TaskStatus
      );
    } else {
      return res.status(400).json({ error: '请提供 assignee 或 instanceId 参数' });
    }

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const task = taskService.getTaskById(id);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/approve', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { approver, comment } = req.body;

    if (!approver) {
      return res.status(400).json({ error: '缺少 approver 参数' });
    }

    const instance = flowInstanceService.approveTask(id, approver, comment);

    if (!instance) {
      const reason = classifyError(id, approver, '审批');
      return res.status(403).json({ error: reason || '审批失败' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/reject', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { rejector, comment } = req.body;

    if (!rejector) {
      return res.status(400).json({ error: '缺少 rejector 参数' });
    }

    const instance = flowInstanceService.rejectTask(id, rejector, comment);

    if (!instance) {
      const reason = classifyError(id, rejector, '拒绝');
      return res.status(403).json({ error: reason || '拒绝失败' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/transfer', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { fromUser, toUser, comment } = req.body;

    if (!fromUser || !toUser) {
      return res.status(400).json({ error: '缺少 fromUser 或 toUser 参数' });
    }

    const instance = flowInstanceService.transferTask(id, fromUser, toUser, comment);

    if (!instance) {
      const reason = classifyError(id, fromUser, '转交');
      return res.status(403).json({ error: reason || '转交失败' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/return', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { operator, comment, targetNodeId } = req.body;

    if (!operator) {
      return res.status(400).json({ error: '缺少 operator 参数' });
    }

    const instance = flowInstanceService.returnTask(id, operator, comment, targetNodeId);

    if (!instance) {
      const reason = classifyError(id, operator, '退回');
      return res.status(403).json({ error: reason || '退回失败' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
