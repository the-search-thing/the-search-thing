import { handle } from '@/lib/main/shared'
import { dialog } from 'electron'
import axios from 'axios';

export const registerSearchHandlers = () => {
  handle('search', async (query: string) => {
    const response = await axios.get('http://localhost:5000/api/search', {
      params: { q: query }
    });
    return { results: response.data.results };
  });
  
  handle('check', async () => {
    const response = await axios.get('http://localhost:5000/api/check', {
      params: {}
    });
    return !!response.data.indexed;
  })
  
  handle('index', async (dirPaths: string) => {
    const response = await axios.post('http://localhost:5000/api/index', {
      dirPaths // Send to API
    });
    return response.data.message;
  });
  
  // System operations
  handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.filePaths[0] ?? '';
  })
  
}
