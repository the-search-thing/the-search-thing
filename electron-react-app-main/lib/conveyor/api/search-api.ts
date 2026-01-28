import { ConveyorApi } from '@/lib/preload/shared'

export class SearchApi extends ConveyorApi {
  check = (input: string) => this.invoke('check', input)
  index = (input: string) => this.invoke('index', input)
  search = (input: string) => this.invoke('search', input)
}
