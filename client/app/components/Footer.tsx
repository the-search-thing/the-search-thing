import { useState, useRef, useEffect } from 'react'
import { useConveyor } from '../hooks/use-conveyor'
import { Button } from './ui/button'
import about from '@/resources/about.svg'
import enter from '@/resources/enter.svg'
import { useAppContext } from '../AppContext'

const phaseLabels: Record<string, string> = {
  scan_text: 'Scanning text files',
  index_text: 'Indexing text files',
  scan_video: 'Scanning videos',
  index_video: 'Indexing videos',
  scan_image: 'Scanning images',
  index_image: 'Indexing images',
  done: 'Done',
}

export default function Footer() {
  const search = useConveyor('search')
  const [isIndexing, setIsIndexing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const {
    currentJobId,
    setCurrentJobId,
    indexingLocation,
    setIndexingLocation,
    setDirIndexed,
    jobStatus,
    setJobStatus,
    setAwaitingIndexing,
  } = useAppContext()

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false)
      }
    }

    if (isPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isPopoverOpen])

  // Poll job status every 2 seconds
  useEffect(() => {
    if (!currentJobId) {
      setJobStatus(null)
      return
    }

    let isActive = true
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const fetchStatus = async () => {
      try {
        const status = await search.indexStatus(currentJobId)
        if (!isActive) return
        setJobStatus(status)
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(intervalId)
          // Clear job state after completion or failure
          const delay = status.status === 'completed' ? 3000 : 5000
          timeoutId = setTimeout(() => {
            if (!isActive) return
            setCurrentJobId(null)
            setIndexingLocation(null)
            setDirIndexed(null)
            setJobStatus(null)
            setAwaitingIndexing(false)
          }, delay)
        }
      } catch (error) {
        console.error('Error fetching index status:', error)
      }
    }

    fetchStatus()
    const intervalId = window.setInterval(fetchStatus, 2000)
    return () => {
      isActive = false
      clearInterval(intervalId)
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [currentJobId, search, setCurrentJobId, setIndexingLocation, setDirIndexed, setJobStatus, setAwaitingIndexing])

  const handleStartIndexing = async () => {
    const res = await search.openFileDialog()

    if (!res || res.length === 0) return

    setIsIndexing(true)
    setErrorMessage('')
    try {
      const indexRes = await search.index(res)
      console.error('Index response:', indexRes)
      if (indexRes.success && indexRes.job_id) {
        setCurrentJobId(indexRes.job_id)
        setDirIndexed(res)
        setIndexingLocation('footer')
        setErrorMessage('')
      } else if (!indexRes.job_id) {
        setErrorMessage('Indexing started but no job ID was returned')
      } else {
        setErrorMessage('No response from indexing')
      }
    } catch (error) {
      console.error('Error indexing files:', error)
      setErrorMessage(`Indexing failed: ${error}`)
    } finally {
      setIsIndexing(false)
    }
  }

  const renderStatus = () => {
    // Show simple status when job is in results or just status message
    if (indexingLocation === 'footer' && jobStatus && currentJobId) {
      const phaseText = phaseLabels[jobStatus.phase] || jobStatus.phase

      if (jobStatus.status === 'failed') {
        return (
          <span className="text-red-400 text-xs truncate max-w-[300px]">
            Failed{jobStatus.error ? `: ${jobStatus.error}` : ''}
          </span>
        )
      }

      if (jobStatus.status === 'completed') {
        return <span className="text-green-400 text-xs">{jobStatus.message || 'Indexing complete'}</span>
      }

      return (
        <span className="text-zinc-400 text-xs truncate max-w-[300px]">
          {phaseText}
          {jobStatus.message && <span className="text-zinc-500 ml-1.5">- {jobStatus.message}</span>}
        </span>
      )
    }

    if (isIndexing) {
      return <span className="opacity-75 text-white text-sm">Indexing...</span>
    }

    if (errorMessage) {
      return <span className="text-red-500 text-xs truncate max-w-[300px]">{errorMessage}</span>
    }

    return null
  }

  return (
    <div className="flex flex-row justify-between items-center w-full h-full">
      <div className="relative" ref={popoverRef}>
        <Button
          variant="transparent"
          className="p-0.5 w-auto h-auto rounded-full cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
        >
          <img src={about} alt="About" className="w-5 h-5 opacity-75" />
        </Button>

        {isPopoverOpen && (
          <div className="absolute left-0 bottom-full mb-2 z-[60] min-w-[120px] rounded-lg bg-zinc-900/70 p-3 text-zinc-100 shadow-xl ring-1 ring-white/10 backdrop-blur-sm">
            <div className="text-xs font-medium mb-1">the-search-thing</div>
            <div className="text-[10px] text-zinc-400">Version 0.1.0</div>
            {/* Arrow pointing down */}
            <div className="absolute left-3 -bottom-1 h-2 w-2 rotate-45 bg-zinc-900/95 ring-1 ring-white/10"></div>
          </div>
        )}
      </div>

      <div className="text-sm flex items-center flex-1 justify-center px-4">{renderStatus()}</div>

      <Button variant="transparent" size="sm" onClick={handleStartIndexing} disabled={isIndexing || !!currentJobId}>
        Index <img src={enter} alt="index File" className="w-5 h-6 opacity-75" />
      </Button>
    </div>
  )
}
