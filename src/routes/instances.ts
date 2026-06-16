import { Router, Request, Response } from 'express';
import { flowInstanceService } from '../services/flowInstanceService';
import { historyService } from '../services/historyService';
import { InstanceStatus } from '../types';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  try {
    const { definitionId, initiator, formData } = req.body;

    if (!definitionId || !initiator) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const instance = flowInstanceService.startInstance(
      definitionId,
      initiator,
      formData || {}
    );

    if (!instance) {
      return res.status(404).json({ error: '流程定义不存在' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { initiator, status } = req.query;
    const instances = flowInstanceService.listInstances(
      initiator as string,
      status as InstanceStatus
    );
    res.json(instances);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const instance = flowInstanceService.getInstance(id);

    if (!instance) {
      return res.status(404).json({ error: '实例不存在' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:id/history', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const history = historyService.getHistoryByInstanceId(id);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/withdraw', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { withdrawer, comment } = req.body;

    if (!withdrawer) {
      return res.status(400).json({ error: '缺少 withdrawer 参数' });
    }

    const instance = flowInstanceService.withdrawInstance(id, withdrawer, comment);

    if (!instance) {
      return res.status(400).json({ error: '撤回失败，可能实例不存在或状态不允许' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
