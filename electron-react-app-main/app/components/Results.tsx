import * as React from "react"
import { useAppContext } from "./AppContext"
import noFiles from "@/resources/no-files-found.svg"

interface ResultsProps {
  results: string[]
  query: string
}

export default function Results({ results, query }: ResultsProps) {
  const { isIndexed } = useAppContext()
  
  // // No results yet
  // if (results.length === 0 && !query) {
  //   return <div className="text-zinc-500">Start typing to search...</div>
  // }
  
  // Searched but found nothing
  if (results.length === 0 && query) {
    return(
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-zinc-500">No results found for "{query}"</div>
      </div>
    )
  }
  
  // Show results if we have them
  return (
    <div className="flex items-center justify-center w-full h-full">
      {!isIndexed ? (
        <div className="flex flex-col items-center justify-center gap-4 w-full h-full pt-30">
          <img src={noFiles} alt="No files" className="w-15 h-15 opacity-75" />
          <div className="text-zinc-500">No files have been indexed :(</div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full">
          {results.map((result, idx) => (
            <div key={idx} className="result-item">
              {result}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
