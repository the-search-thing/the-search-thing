import { ConveyorApi } from '@/lib/preload/shared'
import type { SearchHistoryInsert } from '@/lib/storage/search-history-store'

export class SearchApi extends ConveyorApi {
  index = (dirPaths: string) => this.invoke('index', dirPaths)
  indexStatus = (jobId: string) => this.invoke('index-status', jobId)
  search = (input: string) => this.invoke('search', input)
  
  // system methods
  openFileDialog = () => this.invoke('open-file-dialog')
  openFile = (filePath: string) => this.invoke('open-file', filePath)

  addSearchHistory = (input: SearchHistoryInsert) => this.invoke('search-history/add', input)
  getRecentSearches = (limit = 20) => this.invoke('search-history/recent', limit)
  pruneSearchHistory = (maxItems: number) => this.invoke('search-history/prune', maxItems)
}
