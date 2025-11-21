import { FastifyRequest, FastifyReply } from 'fastify';
import { PostModel } from '../models/postModel';
import { SearchQuery } from '../types';
import { z } from 'zod';

// Ce controller contient les routes qui servent à chercher des données déjà stockées, par exemple :chercher des posts,filtrer par subreddit,chercher un auteur,filtrer par date, nombre de votes, etc.

const searchSchema = z.object({
  keywords: z.array(z.string()).min(1, 'At least one keyword is required'),
  requiredKeywords: z.array(z.string()).optional(),
  subreddits: z.array(z.string()).optional(),
  minUpvotes: z.number().min(0).optional(),
  minKarma: z.number().min(0).optional(),
  dateRange: z.object({
    start: z.string().transform(str => new Date(str)).optional(),
    end: z.string().transform(str => new Date(str)).optional(),
  }).optional(),
  limit: z.number().min(1).max(500).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

export class SearchController {
  /**
   * Advanced search endpoint
   */
  async search(request: FastifyRequest, reply: FastifyReply) {
    try {
      const validatedData = searchSchema.parse(request.body);

      const searchQuery: SearchQuery = {
        ...validatedData,
        dateRange: validatedData.dateRange ? {
          start: validatedData.dateRange.start!,
          end: validatedData.dateRange.end!,
        } : undefined,
      };

      const results = await PostModel.search(searchQuery);

      return reply.send({
        success: true,
        count: results.length,
        data: results,
        query: searchQuery,
      });
    } catch (error: any) {
      console.error('Search error:', error);

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      return reply.status(500).send({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Get recent posts
   */
  async getRecent(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { limit = 50 } = request.query as { limit?: number };

      const posts = await PostModel.findRecent(limit);

      return reply.send({
        success: true,
        count: posts.length,
        data: posts,
      });
    } catch (error: any) {
      console.error('Get recent posts error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get statistics
   */
  async getStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = await PostModel.getStats();

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error('Get stats error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }
}
