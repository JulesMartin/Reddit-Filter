// Core types for Reddit Analyzer

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  ups: number;
  downs: number;
  num_comments: number;
  created_utc: number;
  url: string;
  permalink: string;
}

export interface RedditComment {
  id: string;
  body: string;
  author: string;
  score: number;
  created_utc: number;
  link_id: string;
}

export interface Author {
  id?: number;
  username: string;
  link_karma: number;
  comment_karma: number;
  account_created_utc?: Date;
}

export interface Subreddit {
  id?: number;
  name: string;
  description?: string;
  subscribers_count: number;
}

export interface Post {
  id?: number;
  reddit_id: string;
  title: string;
  content?: string;
  subreddit_id: number;
  author_id?: number;
  score: number;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_utc: Date;
  url: string;
  processed: boolean;
  relevance_score?: number;
}

export interface SearchQuery {
  keywords: string[];
  requiredKeywords?: string[];
  subreddits?: string[];
  minUpvotes?: number;
  minKarma?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  offset?: number;
}

export interface SearchResult extends Post {
  author_username?: string;
  author_karma?: number;
  subreddit_name?: string;
}
