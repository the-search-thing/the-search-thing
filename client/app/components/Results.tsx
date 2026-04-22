import * as React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { FileX } from 'lucide-react'
import { ResultProps, SearchResultItem } from '../types/types'
import * as fileIcons from '@/resources/filetype icons'
import { useConveyor } from '../hooks/use-conveyor'
import { useAppContext } from '../AppContext'

type ResultItem = SearchResultItem

const phaseLabels: Record<string, string> = {
  scan_text: 'Scanning text files',
  index_text: 'Indexing text files',
  scan_video: 'Scanning videos',
  index_video: 'Indexing videos',
  scan_image: 'Scanning images',
  index_image: 'Indexing images',
  done: 'Done',
}

interface ResultsWithContextProps extends ResultProps {
  onIndexingCancelled?: () => void
}

const Results: React.FC<ResultsWithContextProps> = ({
  searchResults,
  query,
  hasSearched,
  onIndexingCancelled,
  recentSearches = [],
  onRecentSearchSelect,
}) => {
  const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null)
  const [hasInitiatedIndexing, setHasInitiatedIndexing] = useState(false)
  const hasOpenedDialogRef = useRef(false)
  const search = useConveyor('search')

  const {
    awaitingIndexing,
    currentJobId,
    setCurrentJobId,
    indexingLocation,
    setIndexingLocation,
    dirIndexed,
    setDirIndexed,
    setAwaitingIndexing,
    jobStatus,
  } = useAppContext()

  const allResults = searchResults?.results || []

  useEffect(() => {
    setSelectedItem(null)
  }, [searchResults])

  useEffect(() => {
    if (!hasSearched) {
      setHasInitiatedIndexing(false)
      hasOpenedDialogRef.current = false
    }
  }, [hasSearched, query])

  const handleOpen = (filePath: string) => {
    search.openFile(filePath)
  }

  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1] || path
  }

  const getFileExt = (path: string) => {
    const parts = path.split('.')
    return parts.length > 1 ? parts[parts.length - 1] : ''
  }

  const handleStartIndexing = useCallback(async () => {
    const res = await search.openFileDialog()
    if (!res || res.length === 0) {
      onIndexingCancelled?.()
      setAwaitingIndexing(false)
      setHasInitiatedIndexing(false)
      hasOpenedDialogRef.current = false
      return
    }

    setDirIndexed(res)
    try {
      const indexRes = await search.index(res)
      console.error('Index response:', indexRes)
      if (indexRes.success && indexRes.job_id) {
        setCurrentJobId(indexRes.job_id)
        setIndexingLocation('results')
      }
    } catch (error) {
      console.error('Error indexing files:', error)
    }
  }, [search, onIndexingCancelled, setCurrentJobId, setIndexingLocation, setDirIndexed, setAwaitingIndexing])

  useEffect(() => {
    if (awaitingIndexing && !currentJobId && !hasInitiatedIndexing && !hasOpenedDialogRef.current) {
      hasOpenedDialogRef.current = true
      setHasInitiatedIndexing(true)
      handleStartIndexing()
    }
  }, [awaitingIndexing, currentJobId, hasInitiatedIndexing, handleStartIndexing])

  const progressSection = (label: string, found: number, indexed: number, errors: number, skipped: number) => {
    const total = found || 1
    const pct = found > 0 ? Math.round((indexed / total) * 100) : 0
    if (found === 0 && indexed === 0) return null
    return (
      <div className="w-full">
        <div className="mb-1 flex justify-between text-xs text-zinc-400">
          <span>{label}</span>
          <span>
            {indexed}/{found}
            {errors > 0 && <span className="ml-1 text-red-400">({errors} errors)</span>}
            {skipped > 0 && <span className="ml-1 text-yellow-600">({skipped} skipped)</span>}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden bg-zinc-700">
          <div className="h-full bg-blue-500 transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  if (indexingLocation === 'results' && awaitingIndexing) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-6">
        <div className="flex items-center gap-3">
          {(!jobStatus || (jobStatus.status !== 'completed' && jobStatus.status !== 'failed')) && (
            <svg className="h-5 w-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <div className="text-lg font-medium text-zinc-200">
            {jobStatus ? phaseLabels[jobStatus.phase] || jobStatus.phase : 'Starting indexing...'}
          </div>
        </div>

        {currentJobId && dirIndexed && <div className="font-mono text-xs text-zinc-500">Directory: {dirIndexed}</div>}

        {jobStatus && (
          <div className="flex w-full max-w-sm flex-col gap-3">
            {progressSection(
              'Text files',
              jobStatus.text_found,
              jobStatus.text_indexed,
              jobStatus.text_errors,
              jobStatus.text_skipped
            )}
            {progressSection(
              'Videos',
              jobStatus.video_found,
              jobStatus.video_indexed,
              jobStatus.video_errors,
              jobStatus.video_skipped
            )}
            {progressSection(
              'Images',
              jobStatus.image_found,
              jobStatus.image_indexed,
              jobStatus.image_errors,
              jobStatus.image_skipped
            )}

            {jobStatus.message && <div className="mt-1 text-center text-xs text-zinc-400">{jobStatus.message}</div>}

            {jobStatus.error && <div className="mt-1 bg-red-950/30 px-3 py-2 text-center text-xs text-red-500">{jobStatus.error}</div>}

            {jobStatus.status === 'completed' && (
              <div className="mt-2 text-center text-sm font-medium text-green-600">Indexing complete!</div>
            )}
            {jobStatus.status === 'failed' && <div className="mt-2 text-center text-sm font-medium text-red-600">Indexing failed</div>}
          </div>
        )}
      </div>
    )
  }

  if (hasSearched && allResults.length === 0 && query) {
    return (
      <div className="flex h-full w-full flex-col items-center gap-4 pt-28">
        <FileX className="h-14 w-14 opacity-55" />
        <div className="flex flex-col items-center">
          <div className="text-zinc-500">No results for "{query}"</div>
          <div className="text-zinc-500">Press Enter to index directories.</div>
        </div>
      </div>
    )
  }

  const showRecentSearches = !hasSearched

  return (
    <div className="flex h-full w-full items-center">
      <div className="flex h-full w-full">
        <div className="flex h-full w-1/3 min-w-[220px] max-w-[320px] flex-col border-r border-zinc-700/80 pr-2">
          <div className="flex-none px-1 py-2">
            <h3 className="text-[0.8rem] font-medium text-zinc-400">{showRecentSearches ? 'Recent Searches' : 'Results'}</h3>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
            {showRecentSearches ? (
              recentSearches.length > 0 ? (
                recentSearches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onRecentSearchSelect?.(item.search_string)}
                    className="flex items-center gap-2 border border-transparent px-2.5 py-2 text-left transition-colors hover:border-zinc-700/70 hover:bg-zinc-700/30"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-zinc-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m21 21-4.3-4.3" />
                      <circle cx="11" cy="11" r="7" />
                    </svg>
                    <span className="truncate text-zinc-100" title={item.search_string}>
                      {item.search_string}
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-2 text-sm text-zinc-500">No recent searches yet.</div>
              )
            ) : (
              allResults.map((result, index) => (
                <button
                  key={`${result.path}-${result.label}-${index}`}
                  type="button"
                  onClick={() => setSelectedItem(result)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleOpen(result.path)
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      handleOpen(result.path)
                    }
                  }}
                  className={`flex w-full cursor-pointer flex-row border px-2.5 py-2 text-left transition-colors ${
                    selectedItem?.path === result.path
                      ? 'border-zinc-600/80 bg-zinc-700/70'
                      : 'border-transparent hover:border-zinc-700/70 hover:bg-zinc-700/30'
                  }`}
                >
                  <div className="shrink-0 pr-2">
                    {result.label === 'video' && result.thumbnail_url ? (
                      <img src={result.thumbnail_url} alt="" className="h-7 w-7 object-cover" loading="lazy" />
                    ) : (
                      <img
                        src={fileIcons[getFileExt(result.path).toLowerCase()] || fileIcons.txt}
                        className="h-5 w-5"
                        alt=""
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-zinc-100" title={result.path}>
                    {getFileName(result.path)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="h-full flex-1">
          {selectedItem ? (
            <div className="h-full py-2 pl-3">
              {selectedItem.label === 'video' && selectedItem.thumbnail_url ? (
                <div className="min-h-[320px] overflow-hidden border border-zinc-700/70 bg-zinc-900/60 p-5">
                  <img src={selectedItem.thumbnail_url} alt="" className="w-full max-h-[360px] bg-zinc-950 object-contain" />
                  <div className="mt-4 max-h-[calc(100vh-260px)] overflow-y-auto whitespace-pre-wrap text-zinc-300">
                    {selectedItem.content ?? 'No preview available for this result.'}
                  </div>
                  <div className="mt-3 truncate text-xs text-zinc-400" title={selectedItem.path}>
                    {selectedItem.path}
                  </div>
                </div>
              ) : (
                <div className="min-h-[320px] overflow-hidden border border-zinc-700/70 bg-zinc-700/35 p-5">
                  <div className="max-h-[calc(100vh-200px)] overflow-y-auto whitespace-pre-wrap text-zinc-300">
                    {selectedItem.content ?? 'No preview available for this result.'}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500">
              {allResults.length > 0 ? 'Select a file to view its content' : 'Search for something to see results'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Results
