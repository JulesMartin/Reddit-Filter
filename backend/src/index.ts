import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { connectRedis } from './utils/redis';
import pool from './utils/database';
import redditService from './services/redditService';
import { SearchController } from './controllers/searchController';
import { ETLController } from './controllers/etlController';

dotenv.config();

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

const searchController = new SearchController();
const etlController = new ETLController();

// CORS
fastify.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
});

// Health check
fastify.get('/api/health', async (request, reply) => {
  try {
    // Check database
    await pool.query('SELECT 1');

    // Check Redis
    const redis = await connectRedis();
    await redis.ping();

    // Get rate limit status
    const rateLimitStatus = redditService.getRateLimitStatus();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        reddit: {
          rateLimit: rateLimitStatus,
        },
      },
    };
  } catch (error: any) {
    return reply.status(503).send({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

// Search routes
fastify.post('/api/posts/search', searchController.search.bind(searchController));
fastify.get('/api/posts/recent', searchController.getRecent.bind(searchController));
fastify.get('/api/posts/stats', searchController.getStats.bind(searchController));

// ETL routes
fastify.post('/api/etl/sync-subreddit', etlController.syncSubreddit.bind(etlController));
fastify.post('/api/etl/sync-search', etlController.syncSearch.bind(etlController));
fastify.post('/api/etl/batch-sync', etlController.batchSync.bind(etlController));
fastify.get('/api/subreddits', etlController.getSubreddits.bind(etlController));

// Start server
const start = async () => {
  try {
    // Connect to Redis
    await connectRedis();
    console.log('✅ Redis connected');

    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected');

    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });

    console.log(`\n🚀 Reddit Analyzer API running on http://localhost:${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
