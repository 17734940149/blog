export type PostStatus = "draft" | "published";

export type PostEnglish = Partial<{
  title: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
}>;

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover: string;
  category: string;
  tags: string[];
  status: PostStatus;
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readingMinutes: number;
  categoryValue?: string;
  tagValues?: string[];
  en?: PostEnglish;
}

export type PostSummary = Omit<Post, "content">;
export type PostInput = Pick<
  Post,
  | "title"
  | "slug"
  | "excerpt"
  | "content"
  | "cover"
  | "category"
  | "tags"
  | "status"
  | "featured"
  | "publishedAt"
  | "en"
>;

export interface PostFilters {
  query?: string;
  category?: string;
  tag?: string;
  featured?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPosts<T = PostSummary> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CategoryCount {
  name: string;
  count: number;
  value?: string;
}

export type ProjectStatus = "building" | "online" | "archived";

export type ProjectEnglish = Partial<{
  title: string;
  description: string;
  stack: string[];
}>;

export interface Project {
  id: string;
  title: string;
  description: string;
  url: string;
  githubUrl: string;
  stack: string[];
  status: ProjectStatus;
  cover: string;
  createdAt: string;
  updatedAt: string;
  en?: ProjectEnglish;
}

export type ProjectInput = Omit<Project, "id" | "createdAt" | "updatedAt">;

export type SettingsEnglish = Partial<{
  title: string;
  tagline: string;
  description: string;
  author: string;
  bio: string;
  location: string;
  about: string;
  currently: string;
  role: string;
  skills: string;
  purpose: string;
}>;

export interface SiteSettings {
  title: string;
  tagline: string;
  description: string;
  author: string;
  bio: string;
  email: string;
  github: string;
  location: string;
  about: string;
  currently: string;
  role: string;
  avatar: string;
  gitlab: string;
  skills: string;
  purpose: string;
  en?: SettingsEnglish;
}

export interface AdminUser {
  id: string;
  email: string;
  account?: string;
}

export interface DashboardStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  totalProjects: number;
  recentPosts: PostSummary[];
}

export interface ApiSuccess<T> {
  data: T;
}
export interface ApiError {
  error: string;
  code: string;
}
