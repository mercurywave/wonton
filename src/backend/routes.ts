import express from 'express';
import cors from 'cors';
import { llmService } from './llm.js';

const router = express.Router();
router.use(cors());
router.use(express.json());

// GET /api/config - Return current LLM configuration
router.get('/config', (_req, res) => {
  res.json(llmService.getConfig());
});

// PUT /api/config - Update LLM configuration
router.put('/config', (req, res) => {
  try {
    const updated = llmService.updateConfig(req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Invalid configuration', details: err });
  }
});

// POST /api/chat - Send messages and get LLM response (streaming)
router.post('/chat', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let assistantContent = '';

  const onChunk = (chunk: string, done: boolean) => {
    assistantContent += chunk;
    res.write(`data: ${JSON.stringify({ content: chunk, done })}\n\n`);

    if (done) {
      res.write(`data: ${JSON.stringify({ done: true, content: '' })}\n\n`);
      res.end();
    }
  };

  try {
    await llmService.chat(messages, onChunk);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.write(`data: ${JSON.stringify({ error: message, done: true })}\n\n`);
    res.end();
  }
});

// POST /api/chat/complete - Non-streaming chat endpoint
router.post('/chat/complete', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  try {
    let assistantContent = '';
    await llmService.chat(messages, (_chunk: string, done: boolean) => {
      if (done) {
        // content already accumulated
      }
    });

    // Re-do as non-stream for simple response
    const response = await fetch(`${llmService.getConfig().baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: llmService.getConfig().model,
        messages,
        max_tokens: llmService.getConfig().maxTokens,
        temperature: llmService.getConfig().temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error: `LLM API error: ${error}` });
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    res.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export { router as chatRouter };
