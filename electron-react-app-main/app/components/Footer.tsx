import { useState } from 'react'
import { useConveyor } from '../hooks/use-conveyor'
import { Button } from './ui/button'
import about from '@/resources/about.svg'
import enter from '@/resources/enter.svg'

export default function Footer() {
  const search = useConveyor('search')
  const [isIndexing, setIsIndexing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleStartIndexing = async () => {
    const res = await search.openFileDialog()

    if (!res || res.length === 0) return // check to prevent indexing null

    setIsIndexing(true)
    setErrorMessage('')
    try {
      const indexRes = await search.index(res)
      console.error('Index response:', indexRes)
      if (indexRes.success && indexRes.job_id) {
        setErrorMessage('') // Success - clear any error message
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
      <img src={about} alt="About" className="w-5 h-5 opacity-75" />

      <div className="text-sm">
        {isIndexing ? (
          <span className="opacity-75">Indexing...</span>
        ) : (
          <span className="text-red-500">{errorMessage}</span>
        )}
      </div>

      <Button variant="transparent" onClick={handleStartIndexing} disabled={isIndexing}>
        Index <img src={enter} alt="index File" className="w-5 h-6 opacity-75" />
      </Button>
    </div>
  )
}
