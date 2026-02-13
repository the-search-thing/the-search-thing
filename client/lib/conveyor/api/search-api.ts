import { ConveyorApi } from '@/lib/preload/shared'

export class SearchApi extends ConveyorApi {
  index = (dirPaths: string) => this.invoke('index', dirPaths)
  search = (input: string) => this.invoke('search', input)
  
  // system methods
  openFileDialog = () => this.invoke('open-file-dialog')
  openFile = (filePath: string) => this.invoke('open-file', filePath)
}
