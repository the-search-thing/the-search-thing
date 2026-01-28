import { ConveyorApi } from '@/lib/preload/shared'

export class SearchApi extends ConveyorApi {
  check = () => this.invoke('check')
  index = (input: string) => this.invoke('index', input)
  search = (input: string) => this.invoke('search', input)
}
