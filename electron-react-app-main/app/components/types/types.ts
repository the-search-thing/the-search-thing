export interface FileObject {
  file_id: string
  content: string
  path: string
}

export interface VideoObject {
  file_id: string
  content: string
  path: string
}

export interface SearchResponse {
  success: boolean
  files: FileObject[]
  videos: VideoObject[]
}

export interface ResultProps {
  searchResults?: SearchResponse
  query: string
  hasSearched: boolean
}
