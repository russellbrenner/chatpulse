import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { resolve } from 'path';
import { existsSync } from 'fs';

import { errorHandler } from './middleware/errorHandler.js';
import uploadRoutes from './routes/upload.js';
import analysisRoutes from './routes/analysis.js';
import messageRoutes from './routes/messages.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    // Structured JSON output (Pino default)
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

// --- Plugin registration ---

// CORS — permissive in dev, restrictive in production
await fastify.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN ?? false)
    : true,
});

// Multipart file uploads (1 GB limit — real chat.db files can be 600+ MB)
await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 1_073_741_824, // 1 GB
  },
});

// Serve the built React frontend in production
const clientDir = resolve(import.meta.dirname ?? '.', '../../dist/client');
if (existsSync(clientDir)) {
  await fastify.register(fastifyStatic, {
    root: clientDir,
    prefix: '/',
    // Don't intercept API routes
    wildcard: false,
  });

  // SPA fallback — serve index.html for non-API routes
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Route ${request.method} ${request.url} not found`,
        },
      });
      return;
    }
    reply.sendFile('index.html');
  });
}

// --- Error handler ---
fastify.setErrorHandler(errorHandler);

// --- Route registration ---
await fastify.register(uploadRoutes);
await fastify.register(analysisRoutes);
await fastify.register(messageRoutes);

// --- Health check ---
fastify.get('/api/health', async () => ({
  status: 'ok',
  service: 'chatpulse-web',
  timestamp: new Date().toISOString(),
}));

// --- Start server ---
try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`ChatPulse web service listening on ${HOST}:${PORT}`);
} catch (err) {
  fastify.log.fatal(err, 'Failed to start ChatPulse web service');
  process.exit(1);
}
