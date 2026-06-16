import { Router, Request, Response } from 'express';
import { flowDefinitionService } from '../services/flowDefinitionService';
import { FlowNode } from '../types';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, nodes, edges, startNodeId, endNodeId } = req.body;

    if (!name || !nodes || !edges || !startNodeId || !endNodeId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const definition = flowDefinitionService.createDefinition(
      name,
      nodes as FlowNode[],
      edges,
      startNodeId,
      endNodeId
    );

    res.json(definition);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/version', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { nodes, edges, startNodeId, endNodeId } = req.body;

    const definition = flowDefinitionService.createNewVersion(
      id,
      nodes as FlowNode[],
      edges,
      startNodeId,
      endNodeId
    );

    if (!definition) {
      return res.status(404).json({ error: '流程定义不存在' });
    }

    res.json(definition);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/', (_req: Request, res: Response) => {
  try {
    const definitions = flowDefinitionService.listDefinitions();
    res.json(definitions);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { version } = req.query;

    const definition = flowDefinitionService.getDefinition(
      id,
      version ? parseInt(version as string) : undefined
    );

    if (!definition) {
      return res.status(404).json({ error: '流程定义不存在' });
    }

    res.json(definition);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
