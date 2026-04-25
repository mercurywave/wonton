import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes.js';

const app = express();
const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', chatRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Wonton backend listening on http://localhost:${PORT}`);
});
