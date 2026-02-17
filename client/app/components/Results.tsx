import * as React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import noFiles from '@/resources/no-files-found.svg'
import { ResultProps, SearchResultItem } from '../types/types'
import * as fileIcons from '@/resources/filetype icons'
import { useConveyor } from '../hooks/use-conveyor'

type ResultItem = SearchResultItem

type IndexJobStatus = {
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

const Results: React.FC<
  ResultProps & {
    currentJobId: string | null
    setCurrentJobId: (jobId: string | null) => void
    onIndexingCancelled?: () => void
  }
> = ({
  searchResults,
  query,
  hasSearched,
  awaitingIndexing,
  currentJobId,
  setCurrentJobId,
  onIndexingCancelled,
}) => {
  const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null)
  const [jobStatus, setJobStatus] = useState<IndexJobStatus | null>(null)
  const [hasInitiatedIndexing, setHasInitiatedIndexing] = useState(false)
  const hasOpenedDialogRef = useRef(false)
  const search = useConveyor('search')

  const allResults = searchResults?.results || []

  useEffect(() => {
    setSelectedItem(null)
  }, [searchResults])

  useEffect(() => {
    if (!hasSearched) {
      setHasInitiatedIndexing(false)
      setCurrentJobId(null)
      setJobStatus(null)
      hasOpenedDialogRef.current = false
    }
  }, [hasSearched, query])

  useEffect(() => {
    if (!currentJobId) {
      setJobStatus(null)
      return
    }

    let isActive = true
    const fetchStatus = async () => {
      try {
        const status = await search.indexStatus(currentJobId)
        if (!isActive) return
        setJobStatus(status)
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(intervalId)
        }
      } catch (error) {
        console.error('Error fetching index status:', error)
      }
    }

    fetchStatus()
    const intervalId = window.setInterval(fetchStatus, 1500)
    return () => {
      isActive = false
      clearInterval(intervalId)
    }
  }, [currentJobId, search])

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
      return
    }

    try {
      const indexRes = await search.index(res)
      console.error('Index response:', indexRes)
      if (indexRes.success && indexRes.job_id) {
        setCurrentJobId(indexRes.job_id)
      }
    } catch (error) {
      console.error('Error indexing files:', error)
    }
  }, [search, onIndexingCancelled])

  useEffect(() => {
    if (
      awaitingIndexing &&
      !currentJobId &&
      !hasInitiatedIndexing &&
      !hasOpenedDialogRef.current
    ) {
      //temporary guardrail for development strict mode
      hasOpenedDialogRef.current = true
      setHasInitiatedIndexing(true)
      handleStartIndexing()
    }
  }, [awaitingIndexing, currentJobId, hasInitiatedIndexing, handleStartIndexing])

  if (awaitingIndexing) {
    const textProgress =
      jobStatus && jobStatus.text_found > 0
        ? Math.min(
            100,
            Math.round((jobStatus.text_indexed / jobStatus.text_found) * 100)
          )
        : null
    const statusText = jobStatus
      ? `${jobStatus.phase} • text ${jobStatus.text_indexed}/${jobStatus.text_found} • videos ${jobStatus.video_indexed}/${jobStatus.video_found} • images ${jobStatus.image_indexed}/${jobStatus.image_found}`
      : 'Waiting for status...'

    return (
      <div className="flex flex-col w-full h-full p-6 gap-4">
        <div className="text-zinc-300 text-lg font-medium">Indexing directories</div>
        {currentJobId && <div className="text-zinc-500 text-sm font-mono">Job ID: {currentJobId}</div>}
        <div className="w-full max-w-xl">
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            {textProgress === null ? (
              <div className="h-full w-1/3 bg-zinc-500 animate-pulse" />
            ) : (
              <div className="h-full bg-zinc-500" style={{ width: `${textProgress}%` }} />
            )}
          </div>
          <div className="mt-2 text-xs text-zinc-500">{statusText}</div>
          {jobStatus?.status === 'failed' && (
            <div className="mt-1 text-xs text-red-400">{jobStatus.error || 'Indexing failed'}</div>
          )}
          {jobStatus?.status === 'completed' && (
            <div className="mt-1 text-xs text-emerald-400">Indexing complete</div>
          )}
        </div>
      </div>
    )
  }

  // Searched but found nothing
  if (hasSearched && allResults.length === 0 && query) {
    return (
      <div className="flex flex-col items-center gap-4 w-full h-full pt-30">
        <img src={noFiles} alt="No files" className="w-15 h-15 opacity-75" />
        <div className="flex flex-col items-center">
          <div className="text-zinc-500">No results for "{query}"</div>
          <div className="text-zinc-500">Press Enter to index directories.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center w-full h-full">
      <div className="flex w-full h-full">
        {/* Files & its paths */}
        <div className="w-1/3 min-w-[200px] max-w-[300px] h-full border-r border-zinc-700 flex flex-col">
          <div className="p-1 flex-none">
            <h3 className="text-zinc-400 text-[0.8rem] font-medium">Recently Used</h3>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-2">
            {allResults.map((result, index) => (
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
                <div className="pr-2">
                  <img src={fileIcons[getFileExt(result.path).toLowerCase()] || fileIcons.txt} className="w-5 h-5" />
                </div>
                <div className="text-white truncate" title={result.path}>
                  {getFileName(result.path)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content preview */}
        <div className="flex-1 h-full ">
          {selectedItem ? (
            <div className="p-4 h-full">
              <div className="p-5 rounded-2xl min-h-[320px] bg-zinc-900 overflow-hidden">
                <div className="text-zinc-300 whitespace-pre-wrap overflow-y-auto max-h-[calc(100vh-200px)]">
                  {selectedItem.content ?? 'No preview available for this result.'}
                </div>
              </div>
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
