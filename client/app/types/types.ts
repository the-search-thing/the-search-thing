export interface SearchResultItem {
  label: string
  content?: string | null
  path: string
  thumbnail_url?: string | null
}

export interface SearchResponse {
  results: SearchResultItem[]
}

export type SearchHistoryEntry = {
  id: number
  search_string: string
  timestamp: number
  file_types: string[] | null
  filters: Record<string, unknown> | null
  path_scope: string | null
}

export interface ResultProps {
  searchResults?: SearchResponse
  query: string
  hasSearched: boolean
}

export type IndexJobStatus = {
  job_id: string
  dir: string
  status: string
  phase: string
  batch_size: number
  text_found: number
  text_indexed: number
  text_errors: number
  text_skipped: number
  video_found: number
  video_indexed: number
  video_errors: number
  video_skipped: number
  image_found: number
  image_indexed: number
  image_errors: number
  image_skipped: number
  message: string
  error: string
  started_at: string
  updated_at: string
  finished_at: string | null
}
