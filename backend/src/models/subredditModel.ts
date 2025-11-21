import { query } from '../utils/database';
import { Subreddit } from '../types';

export class SubredditModel {
  /**
   * Find or create a subreddit
   */
  static async findOrCreate(name: string, description?: string, subscribersCount?: number): Promise<number> {
    const existingResult = await query(
      'SELECT id FROM subreddits WHERE name = $1',
      [name]
    );

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0].id;
    }

    const insertResult = await query(
      `INSERT INTO subreddits (name, description, subscribers_count)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, description || null, subscribersCount || 0]
    );

    return insertResult.rows[0].id;
  }

  /**
   * Get subreddit by name
   */
  static async findByName(name: string): Promise<Subreddit | null> {
    const result = await query(
      'SELECT * FROM subreddits WHERE name = $1',
      [name]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get all subreddits
   */
  static async findAll(): Promise<Subreddit[]> {
    const result = await query(
      'SELECT * FROM subreddits ORDER BY subscribers_count DESC'
    );

    return result.rows;
  }

  /**
   * Update subreddit info
   */
  static async update(name: string, data: Partial<Subreddit>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(data.description);
    }

    if (data.subscribers_count !== undefined) {
      updates.push(`subscribers_count = $${paramCount++}`);
      values.push(data.subscribers_count);
    }

    if (updates.length > 0) {
      values.push(name);
      await query(
        `UPDATE subreddits SET ${updates.join(', ')} WHERE name = $${paramCount}`,
        values
      );
    }
  }
}
