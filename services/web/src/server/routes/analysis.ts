import type { FastifyInstance, FastifyRequest } from 'fastify';
import { proxyToExtraction } from '@server/services/proxy.js';

/**
 * Analysis endpoint names supported by the extraction service.
 * Each maps to /analysis/{endpoint} on the Python service.
 */
const ANALYSIS_ENDPOINTS = [
  'message-counts',
  'timeline',
  'top-contacts',
  'response-times',
  'heatmap',
  'reactions',
] as const;

type AnalysisEndpoint = typeof ANALYSIS_ENDPOINTS[number];

/**
 * Analysis proxy route plugin.
 *
 * Registers GET /api/analysis/:endpoint routes that proxy to the
 * Python extraction service at /analysis/:endpoint.
 */
export default async function analysisRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: { endpoint: string };
    Querystring: Record<string, string>;
  }>('/api/analysis/:endpoint', async (request, reply) => {
    const { endpoint } = request.params;

    // Validate the endpoint name
    if (!ANALYSIS_ENDPOINTS.includes(endpoint as AnalysisEndpoint)) {
      const error = new Error(
        `Unknown analysis endpoint: ${endpoint}. ` +
        `Valid endpoints: ${ANALYSIS_ENDPOINTS.join(', ')}`,
      );
      (error as NodeJS.ErrnoException).code = 'NOT_FOUND';
      (error as { statusCode?: number }).statusCode = 404;
      throw error;
    }

    const result = await proxyToExtraction(`/analysis/${endpoint}`, {
      query: request.query as Record<string, string>,
      logger: request.log,
    });

    return reply.send(result);
  });
}
