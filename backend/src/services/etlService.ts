import redditService from './redditService';
import { SubredditModel } from '../models/subredditModel';
import { AuthorModel } from '../models/authorModel';
import { PostModel } from '../models/postModel';
import { RedditPost } from '../types';

//Les services contiennent la vraie logique métier (la logique fonctionnelle). Contrairement aux controllers, ce sont eux qui font réellement le travail.

class ETLService {
  /**
   * Sync posts from a subreddit to database
   */
  async syncSubreddit(
    subredditName: string,
    limit: number = 100,
    timeFilter: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'week',
    sort: 'hot' | 'new' | 'top' | 'rising' = 'hot'
  ): Promise<{ success: boolean; postsCount: number; errors: string[] }> {
    console.log(`🔄 Starting ETL for r/${subredditName}...`);

    const errors: string[] = [];
    let postsCount = 0;

    try {
      // 1. Fetch posts from Reddit
      const posts = await redditService.fetchPosts(subredditName, limit, timeFilter, sort);

      if (posts.length === 0) {
        console.log(`⚠️ No posts found in r/${subredditName}`);
        return { success: true, postsCount: 0, errors: [] };
      }

      // 2. Store subreddit
      const subredditId = await SubredditModel.findOrCreate(subredditName);

      // 3. Process each post
      for (const post of posts) {
        try {
          await this.storePost(post, subredditId);
          postsCount++;
        } catch (error: any) {
          errors.push(`Failed to store post ${post.id}: ${error.message}`);
          console.error(`❌ Error storing post ${post.id}:`, error.message);
        }
      }

      console.log(`✅ ETL completed for r/${subredditName}: ${postsCount}/${posts.length} posts stored`);

      return {
        success: true,
        postsCount,
        errors,
      };
    } catch (error: any) {
      console.error(`❌ ETL failed for r/${subredditName}:`, error.message);
      return {
        success: false,
        postsCount,
        errors: [error.message],
      };
    }
  }

  /**
   * Store a single post with author info
   */
  private async storePost(redditPost: RedditPost, subredditId: number): Promise<void> {
    // 1. Store or update author
    const authorId = await AuthorModel.findOrCreate(
      redditPost.author,
      0, // We'd need to fetch this from Reddit user API
      0
    );

    // 2. Store post
    const postData = {
      reddit_id: redditPost.id,
      title: redditPost.title,
      content: redditPost.selftext || null,
      subreddit_id: subredditId,
      author_id: authorId,
      score: redditPost.score,
      upvotes: redditPost.ups,
      downvotes: redditPost.downs,
      comment_count: redditPost.num_comments,
      created_utc: new Date(redditPost.created_utc * 1000),
      url: redditPost.url,
      processed: false,
    };

    await PostModel.create(postData);
  }

  /**
   * Search and sync posts based on query
   */
  async syncSearchResults(
    query: string,
    subreddit?: string,
    limit: number = 100
  ): Promise<{ success: boolean; postsCount: number; errors: string[] }> {
    console.log(`🔍 Searching and syncing: "${query}"${subreddit ? ` in r/${subreddit}` : ''}`);

    const errors: string[] = [];
    let postsCount = 0;

    try {
      const posts = await redditService.searchPosts(query, subreddit, limit);

      if (posts.length === 0) {
        console.log(`⚠️ No posts found for query: "${query}"`);
        return { success: true, postsCount: 0, errors: [] };
      }

      // Group posts by subreddit
      const postsBySubreddit = new Map<string, RedditPost[]>();
      posts.forEach(post => {
        if (!postsBySubreddit.has(post.subreddit)) {
          postsBySubreddit.set(post.subreddit, []);
        }
        postsBySubreddit.get(post.subreddit)!.push(post);
      });

      // Process each subreddit
      for (const [subredditName, subredditPosts] of postsBySubreddit) {
        try {
          const subredditId = await SubredditModel.findOrCreate(subredditName);

          for (const post of subredditPosts) {
            try {
              await this.storePost(post, subredditId);
              postsCount++;
            } catch (error: any) {
              errors.push(`Failed to store post ${post.id}: ${error.message}`);
            }
          }
        } catch (error: any) {
          errors.push(`Failed to process subreddit ${subredditName}: ${error.message}`);
        }
      }

      console.log(`✅ Search sync completed: ${postsCount}/${posts.length} posts stored`);

      return {
        success: true,
        postsCount,
        errors,
      };
    } catch (error: any) {
      console.error(`❌ Search sync failed:`, error.message);
      return {
        success: false,
        postsCount,
        errors: [error.message],
      };
    }
  }

  /**
   * Batch sync multiple subreddits
   */
  async syncMultipleSubreddits(
    subreddits: string[],
    limit: number = 50
  ): Promise<Map<string, { success: boolean; postsCount: number; errors: string[] }>> {
    console.log(`🔄 Batch syncing ${subreddits.length} subreddits...`);

    const results = new Map();

    for (const subreddit of subreddits) {
      const result = await this.syncSubreddit(subreddit, limit);
      results.set(subreddit, result);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }
}

export default new ETLService();
