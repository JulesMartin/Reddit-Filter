import axios, { AxiosInstance } from 'axios';
import { RedditPost, RedditComment } from '../types';
import { getCached, setCache } from '../utils/redis';
import dotenv from 'dotenv';

dotenv.config();

interface RedditAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

class RedditService {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private requestCount: number = 0;
  private lastResetTime: number = Date.now();
  private lastRequestTime: number = 0;
  private redditRateLimitRemaining: number = 60;
  private redditRateLimitReset: number = 0;
  private readonly RATE_LIMIT = parseInt(process.env.REDDIT_RATE_LIMIT_PER_MINUTE || '30');
  private readonly MIN_REQUEST_INTERVAL = parseInt(process.env.REDDIT_MIN_REQUEST_INTERVAL_MS || '2000');

  constructor() {
    this.client = axios.create({
      headers: {
        'User-Agent': process.env.REDDIT_USER_AGENT || 'RedditAnalyzer/1.0',
      },
    });
  }

  /**
   * Authenticate with Reddit API
   */
  private async authenticate(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken;
    }

    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Reddit API credentials not configured. Please set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env');
    }

    try {
      const response = await axios.post<RedditAuthResponse>(
        'https://www.reddit.com/api/v1/access_token',
        'grant_type=client_credentials',
        {
          auth: {
            username: clientId,
            password: clientSecret,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': process.env.REDDIT_USER_AGENT || 'RedditAnalyzer/1.0',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = now + (response.data.expires_in * 1000) - 60000; // 1 min buffer

      console.log('✅ Reddit API authenticated');
      return this.accessToken;
    } catch (error: any) {
      console.error('Reddit authentication failed:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Reddit API');
    }
  }

  /**
   * Wait for minimum interval between requests
   */
  private async waitForRequestInterval(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`⏳ Waiting ${waitTime}ms between requests...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Rate limiting check using Reddit's X-Ratelimit headers and local tracking
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceReset = now - this.lastResetTime;

    // Reset counter every minute
    if (timeSinceReset >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    // Check Reddit's rate limit info if available
    if (this.redditRateLimitRemaining <= 1 && this.redditRateLimitReset > now) {
      const waitTime = this.redditRateLimitReset - now;
      console.log(`⏳ Reddit rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.redditRateLimitRemaining = 60;
    }

    // Wait if our local rate limit exceeded
    if (this.requestCount >= this.RATE_LIMIT) {
      const waitTime = 60000 - timeSinceReset;
      console.log(`⏳ Local rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }

    // Always wait minimum interval between requests
    await this.waitForRequestInterval();

    this.requestCount++;
  }

  /**
   * Update rate limit info from Reddit response headers
   */
  private updateRateLimitFromHeaders(headers: any): void {
    if (headers['x-ratelimit-remaining']) {
      this.redditRateLimitRemaining = parseFloat(headers['x-ratelimit-remaining']);
    }
    if (headers['x-ratelimit-reset']) {
      this.redditRateLimitReset = parseInt(headers['x-ratelimit-reset']) * 1000;
    }

    console.log(`📊 Reddit rate limit: ${this.redditRateLimitRemaining} remaining, resets at ${new Date(this.redditRateLimitReset).toLocaleTimeString()}`);
  }

  /**
   * Make request with retry on 429 errors (exponential backoff)
   */
  private async makeRequestWithRetry<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        lastError = error;

        // Handle 429 Too Many Requests
        if (error.response?.status === 429) {
          if (attempt < maxRetries) {
            // Exponential backoff: 5s, 10s, 20s
            const waitTime = 5000 * Math.pow(2, attempt);
            console.log(`⚠️  429 Too Many Requests. Retrying in ${waitTime / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }

        // For other errors, throw immediately
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Fetch posts from a subreddit
   */
  async fetchPosts(
    subreddit: string,
    limit: number = 100,
    timeFilter: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'week',
    sort: 'hot' | 'new' | 'top' | 'rising' = 'hot'
  ): Promise<RedditPost[]> {
    const cacheKey = `reddit:posts:${subreddit}:${sort}:${timeFilter}:${limit}`;

    // Check cache first
    const cached = await getCached(cacheKey);
    if (cached) {
      console.log(`📦 Cache hit for ${subreddit}`);
      return cached;
    }

    await this.checkRateLimit();
    const token = await this.authenticate();

    return this.makeRequestWithRetry(async () => {
      try {
        const url = `https://oauth.reddit.com/r/${subreddit}/${sort}`;
        const response = await this.client.get(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          params: {
            limit,
            t: timeFilter,
          },
        });

        // Update rate limit info from response headers
        this.updateRateLimitFromHeaders(response.headers);

        const posts: RedditPost[] = response.data.data.children
          .filter((child: any) => child.kind === 't3')
          .map((child: any) => this.normalizePostData(child.data));

        // Cache for 10 minutes
        await setCache(cacheKey, posts, 600);

        console.log(`✅ Fetched ${posts.length} posts from r/${subreddit}`);
        return posts;
      } catch (error: any) {
        console.error(`Error fetching posts from r/${subreddit}:`, error.response?.data || error.message);
        throw error;
      }
    });
  }

  /**
   * Search posts across Reddit
   */
  async searchPosts(
    query: string,
    subreddit?: string,
    limit: number = 100,
    sort: 'relevance' | 'hot' | 'top' | 'new' | 'comments' = 'relevance',
    timeFilter: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'all'
  ): Promise<RedditPost[]> {
    await this.checkRateLimit();
    const token = await this.authenticate();

    return this.makeRequestWithRetry(async () => {
      try {
        const url = subreddit
          ? `https://oauth.reddit.com/r/${subreddit}/search`
          : 'https://oauth.reddit.com/search';

        const response = await this.client.get(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          params: {
            q: query,
            limit,
            sort,
            t: timeFilter,
            restrict_sr: subreddit ? true : false,
            type: 'link',
          },
        });

        // Update rate limit info from response headers
        this.updateRateLimitFromHeaders(response.headers);

        const posts: RedditPost[] = response.data.data.children
          .filter((child: any) => child.kind === 't3')
          .map((child: any) => this.normalizePostData(child.data));

        console.log(`✅ Found ${posts.length} posts matching "${query}"`);
        return posts;
      } catch (error: any) {
        console.error(`Error searching posts:`, error.response?.data || error.message);
        throw error;
      }
    });
  }

  /**
   * Fetch comments for a post
   */
  async fetchComments(subreddit: string, postId: string, limit: number = 100): Promise<RedditComment[]> {
    await this.checkRateLimit();
    const token = await this.authenticate();

    return this.makeRequestWithRetry(async () => {
      try {
        const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}`;
        const response = await this.client.get(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          params: { limit },
        });

        // Update rate limit info from response headers
        this.updateRateLimitFromHeaders(response.headers);

        const comments: RedditComment[] = [];
        this.extractComments(response.data[1].data.children, comments);

        console.log(`✅ Fetched ${comments.length} comments for post ${postId}`);
        return comments;
      } catch (error: any) {
        console.error(`Error fetching comments:`, error.response?.data || error.message);
        throw error;
      }
    });
  }

  /**
   * Extract comments recursively
   */
  private extractComments(children: any[], comments: RedditComment[]): void {
    for (const child of children) {
      if (child.kind === 't1') {
        comments.push({
          id: child.data.id,
          body: child.data.body,
          author: child.data.author,
          score: child.data.score,
          created_utc: child.data.created_utc,
          link_id: child.data.link_id,
        });

        if (child.data.replies && child.data.replies.data) {
          this.extractComments(child.data.replies.data.children, comments);
        }
      }
    }
  }

  /**
   * Normalize Reddit post data
   */
  private normalizePostData(rawPost: any): RedditPost {
    return {
      id: rawPost.id,
      title: rawPost.title,
      selftext: rawPost.selftext || '',
      author: rawPost.author,
      subreddit: rawPost.subreddit,
      score: rawPost.score,
      ups: rawPost.ups,
      downs: rawPost.downs,
      num_comments: rawPost.num_comments,
      created_utc: rawPost.created_utc,
      url: rawPost.url,
      permalink: rawPost.permalink,
    };
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(): { requestCount: number; limit: number; resetsIn: number } {
    const now = Date.now();
    const resetsIn = Math.max(0, 60000 - (now - this.lastResetTime));

    return {
      requestCount: this.requestCount,
      limit: this.RATE_LIMIT,
      resetsIn: Math.ceil(resetsIn / 1000),
    };
  }
}

export default new RedditService();
