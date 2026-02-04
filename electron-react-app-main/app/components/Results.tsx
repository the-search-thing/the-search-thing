import * as React from 'react'
import { useState } from 'react'
import { useAppContext } from './AppContext'
import noFiles from '@/resources/no-files-found.svg'
import { ResultProps, FileObject, VideoObject } from './types/types'

type ResultItem = FileObject | VideoObject

const Results: React.FC<ResultProps> = ({ searchResults, query, hasSearched }) => {
  const { isIndexed } = useAppContext()
  const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null)

  // extract the files & vids
  const files = searchResults?.files || []
  const videos = searchResults?.videos || []
  const allResults = [...files, ...videos]

  React.useEffect(() => {
    setSelectedItem(null)
  }, [searchResults])

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

  return (
    <div className="flex items-center w-full h-full">
      {!isIndexed ? (
        <div className="flex flex-col items-center gap-4 w-full h-full pt-30">
          <img src={noFiles} alt="No files" className="w-15 h-15 opacity-75" />
          <div className="text-zinc-500">No files have been indexed :(</div>
        </div>
      ) : (
        <div className="flex w-full h-full">
          {/* Files & its paths */}
          <div className="w-1/3 min-w-[200px] max-w-[300px] h-full border-r border-zinc-700 flex flex-col">
            <div className="p-3 border-b border-zinc-700">
              <h3 className="text-zinc-400 text-sm font-medium">Results..</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allResults.map((result) => (
                <div
                  key={result.file_id}
                  onClick={() => setSelectedItem(result)}
                  className={`p-3 cursor-pointer hover:bg-zinc-800 transition-colors border-b border-zinc-800 ${
                    selectedItem?.file_id === result.file_id ? 'bg-zinc-800' : ''
                  }`}
                >
                  <p className="text-white text-sm truncate" title={result.path}>
                    {getFileName(result.path)}
                  </p>
                  <p className="text-zinc-500 text-xs truncate" title={result.path}>
                    {result.path}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Content preview */}
          <div className="flex-1 h-full overflow-y-auto">
            {selectedItem ? (
              <div className="p-4">
                <div className="mb-4 pb-3 border-b border-zinc-700">
                  <h3 className="text-white font-medium">{getFileName(selectedItem.path)}</h3>
                  <p className="text-zinc-500 text-sm">{selectedItem.path}</p>
                </div>
                <div className="text-zinc-300 whitespace-pre-wrap">{selectedItem.content}</div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500">
                {allResults.length > 0 ? 'Select a file to view its content' : 'Search for something to see results'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Results
