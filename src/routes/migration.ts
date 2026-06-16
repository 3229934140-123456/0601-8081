import { Router, Request, Response } from 'express';
import { migrationService } from '../services/migrationService';

const router = Router();

router.get('/running/:definitionId', (req: Request, res: Response) => {
  try {
    const definitionId = req.params.definitionId as string;
    const instances = migrationService.getRunningInstances(definitionId);
    res.json(instances);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/migrate/:instanceId', (req: Request, res: Response) => {
  try {
    const instanceId = req.params.instanceId as string;
    const { targetVersion, strategy, operator } = req.body;

    if (!targetVersion || !strategy || !operator) {
      return res.status(400).json({ error: '缺少必要参数: targetVersion, strategy, operator' });
    }

    if (!['current_node_only', 'full_restart', 'smart_migrate'].includes(strategy)) {
      return res.status(400).json({ error: 'strategy 必须是 current_node_only, full_restart 或 smart_migrate' });
    }

    const instance = migrationService.migrateInstance(
      instanceId,
      targetVersion,
      strategy as any,
      operator
    );

    if (!instance) {
      return res.status(400).json({ error: '迁移失败' });
    }

    res.json(instance);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/batch-migrate/:definitionId', (req: Request, res: Response) => {
  try {
    const definitionId = req.params.definitionId as string;
    const { targetVersion, strategy, operator } = req.body;

    if (!targetVersion || !strategy || !operator) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = migrationService.batchMigrate(
      definitionId,
      targetVersion,
      strategy as any,
      operator
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
