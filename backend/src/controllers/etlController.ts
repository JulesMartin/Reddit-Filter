import { FastifyRequest, FastifyReply } from 'fastify';
import etlService from '../services/etlService';
import { SubredditModel } from '../models/subredditModel';
import { z } from 'zod';

// Les controllers sont la partie du code qui reçoit les requêtes HTTP (depuis un front-end ou un outil comme Postman) et décide quoi faire avec.Ils ne font pas eux-mêmes le “gros travail”, ils passent la main aux services.

const syncSubredditSchema = z.object({
  subreddit: z.string().min(1),
  limit: z.number().min(1).max(500).optional().default(100),
  timeFilter: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().default('week'),
  sort: z.enum(['hot', 'new', 'top', 'rising']).optional().default('hot'),
});

const syncSearchSchema = z.object({
  query: z.string().min(1),
  subreddit: z.string().optional(),
  limit: z.number().min(1).max(500).optional().default(100),
});

const batchSyncSchema = z.object({
  subreddits: z.array(z.string()).min(1).max(10),
  limit: z.number().min(1).max(100).optional().default(50),
});

export class ETLController {
  /**
   * Sync posts from a subreddit
   */
  async syncSubreddit(request: FastifyRequest, reply: FastifyReply) {
    try {
      const validatedData = syncSubredditSchema.parse(request.body);

      const result = await etlService.syncSubreddit(
        validatedData.subreddit,
        validatedData.limit,
        validatedData.timeFilter,
        validatedData.sort
      );

      return reply.send({
        success: result.success,
        message: `Synced ${result.postsCount} posts from r/${validatedData.subreddit}`,
        data: result,
      });
    } catch (error: any) {
      console.error('Sync subreddit error:', error);

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Sync search results
   */
  async syncSearch(request: FastifyRequest, reply: FastifyReply) {
    try {
      const validatedData = syncSearchSchema.parse(request.body);

      const result = await etlService.syncSearchResults(
        validatedData.query,
        validatedData.subreddit,
        validatedData.limit
      );

      return reply.send({
        success: result.success,
        message: `Synced ${result.postsCount} posts matching "${validatedData.query}"`,
        data: result,
      });
    } catch (error: any) {
      console.error('Sync search error:', error);

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Batch sync multiple subreddits
   */
  async batchSync(request: FastifyRequest, reply: FastifyReply) {
    try {
      const validatedData = batchSyncSchema.parse(request.body);

      const results = await etlService.syncMultipleSubreddits(
        validatedData.subreddits,
        validatedData.limit
      );

      const summary = {
        total: validatedData.subreddits.length,
        successful: 0,
        totalPosts: 0,
      };

      results.forEach(result => {
        if (result.success) summary.successful++;
        summary.totalPosts += result.postsCount;
      });

      return reply.send({
        success: true,
        message: `Batch sync completed: ${summary.successful}/${summary.total} subreddits, ${summary.totalPosts} posts`,
        summary,
        details: Object.fromEntries(results),
      });
    } catch (error: any) {
      console.error('Batch sync error:', error);

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get all synced subreddits
   */
  async getSubreddits(request: FastifyRequest, reply: FastifyReply) {
    try {
      const subreddits = await SubredditModel.findAll();

      return reply.send({
        success: true,
        count: subreddits.length,
        data: subreddits,
      });
    } catch (error: any) {
      console.error('Get subreddits error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }
}
