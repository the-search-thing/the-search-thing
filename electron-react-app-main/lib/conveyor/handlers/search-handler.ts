import { handle } from '@/lib/main/shared'
import { dialog } from 'electron'
import axios from 'axios';

export const registerSearchHandlers = () => {
  handle('search', async (query: string) => {
    const response = await axios.get('http://localhost:3000/api/search', {
      params: { q: query }
    });
    return { results: response.data.results };
  });
  
  handle('check', async () => {
    const response = await axios.get('http://localhost:3000/api/search', {
      params: {}
    });
    return !!response.data.indexed;
  })
  
  handle('index', async (query: string) => {
    const response = await axios.post('http://localhost:3000/api/search', {
      params: { q: query }
    });
    return !!response.data.success;
  })
  
  // System operations
  handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections']
    })
    return {results: result.filePaths}
  })
  
}
