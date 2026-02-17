import { handle } from '@/lib/main/shared'
import { dialog, shell } from 'electron'
import axios from 'axios'

export const registerSearchHandlers = () => {
  handle('search', async (query: string) => {
    const response = await axios.get('http://localhost:8000/api/search', {
      params: { q: query },
    })
    return response.data
  })

  handle('index', async (dirPaths: string) => {
    const response = await axios.get('http://localhost:8000/api/index', {
      params: { dir: dirPaths },
    })
    return { success: response.data.success, job_id: response.data.job_id }
  })

  handle('index-status', async (jobId: string) => {
    const response = await axios.get('http://localhost:8000/api/index/status', {
      params: { job_id: jobId },
    })
    return response.data
  })

  // System operations
  handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    return result.filePaths[0] ?? ''
  })

  handle('open-file', async (filePath: string) => {
    await shell.openPath(filePath)
    return null
  })
}
