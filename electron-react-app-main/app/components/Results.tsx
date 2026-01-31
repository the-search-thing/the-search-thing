import * as React from "react"
import { useState } from "react"

interface ResultsProps {
  results: string[]
  query: string
}

export default function Results({results, query }: ResultsProps) {
  // No results yet
  if (results.length === 0 && !query) {
    return <div className="text-zinc-500">Start typing to search...</div>
  }
  
  // Searched but found nothing
  if (results.length === 0 && query) {
    return <div className="text-zinc-500">No results found for "{query}"</div>
  }
  
  return (
    <div>
      {results.length > 0 && (
        <div className="results-container">
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