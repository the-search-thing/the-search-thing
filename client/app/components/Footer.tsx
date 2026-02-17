import { useState, useRef, useEffect } from 'react'
import { useConveyor } from '../hooks/use-conveyor'
import { Button } from './ui/button'
import about from '@/resources/about.svg'
import enter from '@/resources/enter.svg'

export default function Footer() {
  const search = useConveyor('search')
  const [isIndexing, setIsIndexing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

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

  const handleStartIndexing = async () => {
    const res = await search.openFileDialog()

    if (!res || res.length === 0) return

    setIsIndexing(true)
    setErrorMessage('')
    try {
      const indexRes = await search.index(res)
      console.error('Index response:', indexRes)
      if (indexRes.success && indexRes.job_id) {
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
            <div className="text-[10px] text-zinc-400">
              Version 0.1.0
            </div>
            {/* Arrow pointing down */}
            <div className="absolute left-3 -bottom-1 h-2 w-2 rotate-45 bg-zinc-900/95 ring-1 ring-white/10"></div>
          </div>
        )}
      </div>

      <div className="text-sm">
        {isIndexing ? (
          <span className="opacity-75">Indexing...</span>
        ) : (
          errorMessage && <span className="text-red-500">{errorMessage}</span>
        )}
      </div>

      <Button variant="transparent" size="sm" onClick={handleStartIndexing} disabled={isIndexing}>
        Index <img src={enter} alt="index File" className="w-5 h-6 opacity-75" />
      </Button>
    </div>
  )
}
