import { query } from '../utils/database';
import { Post, SearchQuery, SearchResult } from '../types';

export class PostModel {
  /**
   * Create a new post
   */
  static async create(post: Omit<Post, 'id'>): Promise<number> {
    const result = await query(
      `INSERT INTO posts (
        reddit_id, title, content, subreddit_id, author_id,
        score, upvotes, downvotes, comment_count, created_utc, url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (reddit_id) DO UPDATE SET
        score = EXCLUDED.score,
        upvotes = EXCLUDED.upvotes,
        downvotes = EXCLUDED.downvotes,
        comment_count = EXCLUDED.comment_count
      RETURNING id`,
      [
        post.reddit_id,
        post.title,
        post.content || null,
        post.subreddit_id,
        post.author_id || null,
        post.score,
        post.upvotes,
        post.downvotes,
        post.comment_count,
        post.created_utc,
        post.url,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Advanced search with filters
   */
  static async search(searchQuery: SearchQuery): Promise<SearchResult[]> {
    let sql = `
      SELECT
        p.*,
        a.username as author_username,
        (a.link_karma + a.comment_karma) as author_karma,
        s.name as subreddit_name
      FROM posts p
      LEFT JOIN authors a ON p.author_id = a.id
      LEFT JOIN subreddits s ON p.subreddit_id = s.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 1;

    // Keyword search using full-text search
    if (searchQuery.keywords && searchQuery.keywords.length > 0) {
      const searchTerms = searchQuery.keywords.join(' | ');
      sql += ` AND (
        to_tsvector('english', p.title) @@ to_tsquery('english', $${paramCount})
        OR to_tsvector('english', COALESCE(p.content, '')) @@ to_tsquery('english', $${paramCount})
      )`;
      params.push(searchTerms);
      paramCount++;
    }

    // Required keywords (must all be present)
    if (searchQuery.requiredKeywords && searchQuery.requiredKeywords.length > 0) {
      searchQuery.requiredKeywords.forEach(keyword => {
        sql += ` AND (
          p.title ILIKE $${paramCount} OR p.content ILIKE $${paramCount}
        )`;
        params.push(`%${keyword}%`);
        paramCount++;
      });
    }

    // Subreddit filter
    if (searchQuery.subreddits && searchQuery.subreddits.length > 0) {
      sql += ` AND s.name = ANY($${paramCount})`;
      params.push(searchQuery.subreddits);
      paramCount++;
    }

    // Minimum upvotes filter
    if (searchQuery.minUpvotes !== undefined) {
      sql += ` AND p.score >= $${paramCount}`;
      params.push(searchQuery.minUpvotes);
      paramCount++;
    }

    // Minimum karma filter
    if (searchQuery.minKarma !== undefined) {
      sql += ` AND (a.link_karma + a.comment_karma) >= $${paramCount}`;
      params.push(searchQuery.minKarma);
      paramCount++;
    }

    // Date range filter
    if (searchQuery.dateRange) {
      if (searchQuery.dateRange.start) {
        sql += ` AND p.created_utc >= $${paramCount}`;
        params.push(searchQuery.dateRange.start);
        paramCount++;
      }
      if (searchQuery.dateRange.end) {
        sql += ` AND p.created_utc <= $${paramCount}`;
        params.push(searchQuery.dateRange.end);
        paramCount++;
      }
    }

    // Order by relevance score, then by post score
    sql += ` ORDER BY p.relevance_score DESC, p.score DESC`;

    // Pagination
    const limit = searchQuery.limit || 50;
    const offset = searchQuery.offset || 0;
    sql += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Calculate and update relevance score for posts
   */
  static async updateRelevanceScore(postId: number, keywords: string[]): Promise<void> {
    const postResult = await query(
      'SELECT title, content FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) return;

    const post = postResult.rows[0];
    const text = (post.title + ' ' + (post.content || '')).toLowerCase();

    let score = 0;
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword.toLowerCase(), 'g');
      const titleMatches = (post.title.toLowerCase().match(regex) || []).length;
      const contentMatches = ((post.content || '').toLowerCase().match(regex) || []).length;

      // Title matches are weighted more heavily
      score += titleMatches * 10 + contentMatches * 5;
    });

    await query(
      'UPDATE posts SET relevance_score = $1 WHERE id = $2',
      [score, postId]
    );
  }

  /**
   * Get posts by subreddit
   */
  static async findBySubreddit(subredditId: number, limit: number = 50): Promise<Post[]> {
    const result = await query(
      `SELECT * FROM posts
       WHERE subreddit_id = $1
       ORDER BY created_utc DESC
       LIMIT $2`,
      [subredditId, limit]
    );

    return result.rows;
  }

  /**
   * Get recent posts
   */
  static async findRecent(limit: number = 50): Promise<SearchResult[]> {
    const result = await query(
      `SELECT
        p.*,
        a.username as author_username,
        (a.link_karma + a.comment_karma) as author_karma,
        s.name as subreddit_name
      FROM posts p
      LEFT JOIN authors a ON p.author_id = a.id
      LEFT JOIN subreddits s ON p.subreddit_id = s.id
      ORDER BY p.created_utc DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get post statistics
   */
  static async getStats(): Promise<any> {
    const result = await query(`
      SELECT
        COUNT(*) as total_posts,
        COUNT(DISTINCT subreddit_id) as total_subreddits,
        COUNT(DISTINCT author_id) as total_authors,
        AVG(score) as avg_score,
        MAX(score) as max_score,
        SUM(comment_count) as total_comments
      FROM posts
    `);

    return result.rows[0];
  }
}
