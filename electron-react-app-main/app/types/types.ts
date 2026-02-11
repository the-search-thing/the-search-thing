export interface SearchResultItem {
  label: string
  content?: string | null
  path: string
}

export interface SearchResponse {
  results: SearchResultItem[]
}

export interface ResultProps {
  searchResults?: SearchResponse
  query: string
  hasSearched: boolean
}
