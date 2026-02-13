import * as React from 'react'
import { useState, useEffect } from 'react'
import { useAppContext } from './AppContext'
import noFiles from '@/resources/no-files-found.svg'
import { ResultProps, SearchResultItem } from './types/types'
import * as fileIcons from "@/resources/filetype icons"
import { useConveyor } from "../hooks/use-conveyor"


type ResultItem = SearchResultItem


const Results: React.FC<ResultProps> = ({ searchResults, query, hasSearched }) => {
  // const { isIndexed } = useAppContext()
  const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null)
  const search = useConveyor("search")

  const allResults = searchResults?.results || []

  useEffect(() => {
    setSelectedItem(null)
  }, [searchResults])

  const handleOpen = (filePath: string) => {
    search.openFile(filePath)
  }
  // Searched but found nothing
  if (hasSearched && allResults.length === 0 && query) {
    return (
      <div className="flex flex-col items-center gap-4 w-full h-full pt-30">
        <img src={noFiles} alt="No files" className="w-15 h-15 opacity-75" />
        <div className="text-zinc-500">No results have been found for "{query}"</div>
      </div>
    )
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
                <div className='pr-2'>
                  <img
                    src={fileIcons[getFileExt(result.path).toLowerCase()] || fileIcons.txt}
                    className='w-5 h-5'
                  />
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
                <div className='p-5 rounded-2xl min-h-[320px] bg-zinc-900 overflow-hidden'>
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
