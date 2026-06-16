import express from 'express';
import { initDatabase } from './database';
import definitionsRouter from './routes/definitions';
import instancesRouter from './routes/instances';
import tasksRouter from './routes/tasks';
import migrationRouter from './routes/migration';

const app = express();
const PORT = process.env.PORT || 3000;

initDatabase();

app.use(express.json());

app.use('/api/definitions', definitionsRouter);
app.use('/api/instances', instancesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/migration', migrationRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Workflow API server is running on port ${PORT}`);
});

export default app;
