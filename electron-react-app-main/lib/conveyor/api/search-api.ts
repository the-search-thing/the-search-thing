import { ConveyorApi } from '@/lib/preload/shared'

export class SearchApi extends ConveyorApi {
  check = () => this.invoke('check')
  index = (filePaths: Array<string>) => this.invoke('index', filePaths)
  search = (input: string) => this.invoke('search', input)
  
  // system methods
  openFileDialog = () => this.invoke('open-file-dialog')
}
