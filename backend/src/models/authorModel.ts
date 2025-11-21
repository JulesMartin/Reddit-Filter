import { query } from '../utils/database';
import { Author } from '../types';

//Un model représente la structure d’un type de données dans la base. On peut voir ça comme un “plan” ou une “fiche d’identité” d’un objet (post, auteur, subreddit).

export class AuthorModel {
  /**
   * Find or create an author
   */
  static async findOrCreate(
    username: string,
    linkKarma: number = 0,
    commentKarma: number = 0
  ): Promise<number> {
    const existingResult = await query(
      'SELECT id FROM authors WHERE username = $1',
      [username]
    );

    if (existingResult.rows.length > 0) {
      // Update karma if it has changed
      await query(
        `UPDATE authors
         SET link_karma = $1, comment_karma = $2
         WHERE username = $3`,
        [linkKarma, commentKarma, username]
      );
      return existingResult.rows[0].id;
    }

    const insertResult = await query(
      `INSERT INTO authors (username, link_karma, comment_karma)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [username, linkKarma, commentKarma]
    );

    return insertResult.rows[0].id;
  }

  /**
   * Get author by username
   */
  static async findByUsername(username: string): Promise<Author | null> {
    const result = await query(
      'SELECT * FROM authors WHERE username = $1',
      [username]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get high karma authors
   */
  static async findHighKarmaAuthors(minKarma: number = 10000): Promise<Author[]> {
    const result = await query(
      `SELECT * FROM authors
       WHERE link_karma > $1 OR comment_karma > $1
       ORDER BY (link_karma + comment_karma) DESC
       LIMIT 100`,
      [minKarma]
    );

    return result.rows;
  }
}
