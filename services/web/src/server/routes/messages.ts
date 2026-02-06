import type { FastifyInstance } from 'fastify';
import { proxyToExtraction } from '@server/services/proxy.js';

/**
 * Message, contact, and chat proxy routes.
 *
 * These endpoints proxy to the Python extraction service's /extract/*
 * endpoints, providing the web frontend with a unified API surface.
 */
export default async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  /** GET /api/messages — List messages with optional filters. */
  fastify.get<{
    Querystring: Record<string, string>;
  }>('/api/messages', async (request, reply) => {
    const result = await proxyToExtraction('/extract/messages', {
      query: request.query as Record<string, string>,
      logger: request.log,
    });
    return reply.send(result);
  });

  /** GET /api/contacts — List all contacts/handles. */
  fastify.get<{
    Querystring: Record<string, string>;
  }>('/api/contacts', async (request, reply) => {
    const result = await proxyToExtraction('/extract/contacts', {
      query: request.query as Record<string, string>,
      logger: request.log,
    });
    return reply.send(result);
  });

  /** GET /api/chats — List all chat threads. */
  fastify.get<{
    Querystring: Record<string, string>;
  }>('/api/chats', async (request, reply) => {
    const result = await proxyToExtraction('/extract/chats', {
      query: request.query as Record<string, string>,
      logger: request.log,
    });
    return reply.send(result);
  });

  /** GET /api/chats/:id/messages — List messages for a specific chat. */
  fastify.get<{
    Params: { id: string };
    Querystring: Record<string, string>;
  }>('/api/chats/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const result = await proxyToExtraction(`/extract/chats/${id}/messages`, {
      query: request.query as Record<string, string>,
      logger: request.log,
    });
    return reply.send(result);
  });
}
