import * as React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import noFiles from '@/resources/no-files-found.svg'
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

  // Extract filename from path
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
      // User cancelled the file dialog - reset the awaiting state
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
      //temporary guardrail for development strict mode
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
        <div className="flex justify-between text-xs text-zinc-400 mb-1">
          <span>{label}</span>
          <span>
            {indexed}/{found}
            {errors > 0 && <span className="text-red-400 ml-1">({errors} errors)</span>}
            {skipped > 0 && <span className="text-yellow-600 ml-1">({skipped} skipped)</span>}
          </span>
        </div>
        <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  // Show full indexing UI when actively indexing in results view
  if (indexingLocation === 'results' && awaitingIndexing) {
    return (
      <div className="flex flex-col w-full h-full items-center justify-center p-6 gap-5">
        {/* Spinner + phase label */}
        <div className="flex items-center gap-3">
          {(!jobStatus || (jobStatus.status !== 'completed' && jobStatus.status !== 'failed')) && (
            <svg className="animate-spin h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <div className="text-zinc-200 text-lg font-medium">
            {jobStatus ? phaseLabels[jobStatus.phase] || jobStatus.phase : 'Starting indexing...'}
          </div>
        </div>

        {currentJobId && dirIndexed && <div className="text-zinc-500 text-xs font-mono">Directory: {dirIndexed}</div>}

        {jobStatus && (
          <div className="flex flex-col gap-3 w-full max-w-sm">
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

            {/* Status message */}
            {jobStatus.message && <div className="text-zinc-400 text-xs text-center mt-1">{jobStatus.message}</div>}

            {/* Error */}
            {jobStatus.error && (
              <div className="text-red-500 text-xs text-center mt-1 bg-red-950/30 rounded px-3 py-2">
                {jobStatus.error}
              </div>
            )}

            {/* Completed / failed badge */}
            {jobStatus.status === 'completed' && (
              <div className="text-green-600 text-sm text-center mt-2 font-medium">Indexing complete!</div>
            )}
            {jobStatus.status === 'failed' && (
              <div className="text-red-600 text-sm text-center mt-2 font-medium">Indexing failed</div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Searched but found nothing
  if (hasSearched && allResults.length === 0 && query) {
    return (
      <div className="flex flex-col items-center gap-4 w-full h-full pt-30">
        <FileX className="w-15 h-15 opacity-55" />
        <div className="flex flex-col items-center">
          <div className="text-zinc-500">No results for "{query}"</div>
          <div className="text-zinc-500">Press Enter to index directories.</div>
        </div>
      </div>
    )
  }

  const showRecentSearches = !hasSearched

  return (
    <div className="flex items-center w-full h-full">
      <div className="flex w-full h-full">
        {/* Files & its paths */}
        <div className="w-1/3 min-w-[200px] max-w-[300px] h-full border-r border-zinc-700 flex flex-col">
          <div className="p-1 flex-none">
            <h3 className="text-zinc-400 text-[0.8rem] font-medium">
              {showRecentSearches ? 'Recent Searches' : 'Results'}
            </h3>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-2">
            {showRecentSearches ? (
              recentSearches.length > 0 ? (
                recentSearches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onRecentSearchSelect?.(item.search_string)}
                    className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:bg-zinc-800 transition-colors border-b border-zinc-800 text-left"
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
                    <span className="text-zinc-100 truncate" title={item.search_string}>
                      {item.search_string}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-zinc-500 text-sm p-2">No recent searches yet.</div>
              )
            ) : (
              allResults.map((result, index) => (
                <div
                  key={`${result.path}-${result.label}-${index}`}
                  tabIndex={0}
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
                   className={`flex flex-row p-2 rounded-xl cursor-pointer hover:bg-zinc-800 transition-colors border-b border-zinc-800 ${
                     selectedItem?.path === result.path ? 'bg-zinc-700' : ''
                   }`}
                >
                  <div className="pr-2 shrink-0">
                    {result.label === 'video' && result.thumbnail_url ? (
                      <img
                        src={result.thumbnail_url}
                        alt=""
                        className="w-7 h-7 rounded-md object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <img
                        src={fileIcons[getFileExt(result.path).toLowerCase()] || fileIcons.txt}
                        className="w-5 h-5"
                        alt=""
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-zinc-100 truncate" title={result.path}>
                    {getFileName(result.path)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Content preview */}
        <div className="flex-1 h-full">
          {selectedItem ? (
            <div className="pl-4 py-2 h-full">
              {selectedItem.label === 'video' && selectedItem.thumbnail_url ? (
                <div className="p-5 rounded-2xl min-h-[320px] bg-zinc-900/60 overflow-hidden">
                  <img
                    src={selectedItem.thumbnail_url}
                    alt=""
                    className="w-full max-h-[360px] object-contain rounded-xl bg-zinc-950"
                  />
                  <div className="text-zinc-300 whitespace-pre-wrap overflow-y-auto max-h-[calc(100vh-260px)] mt-4">
                    {selectedItem.content ?? 'No preview available for this result.'}
                  </div>
                  <div className="text-zinc-400 text-xs mt-3 truncate" title={selectedItem.path}>
                    {selectedItem.path}
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-2xl min-h-[320px] bg-zinc-700/60 overflow-hidden">
                  <div className="text-zinc-300 whitespace-pre-wrap overflow-y-auto max-h-[calc(100vh-200px)]">
                    {selectedItem.content ?? 'No preview available for this result.'}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              {allResults.length > 0 ? 'Select a file to view its content' : 'Search for something to see results'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Results
