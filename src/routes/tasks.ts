import { Router, Request, Response } from 'express';
import { taskService } from '../services/taskService';
import { flowInstanceService } from '../services/flowInstanceService';
import { TaskStatus } from '../types';

const router = Router();

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
      return res.status(400).json({ error: '审批失败' });
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
      return res.status(400).json({ error: '拒绝失败' });
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
      return res.status(400).json({ error: '转交失败' });
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
      return res.status(400).json({ error: '退回失败' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
