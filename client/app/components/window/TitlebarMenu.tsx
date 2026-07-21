export interface TitlebarMenuItem {
  name: string;
  action?: string;
  actionParams?: (string | number | object)[];
  shortcut?: string;
  items?: TitlebarMenuItem[];
  actionCallback?: () => void;
}

export interface TitlebarMenuConfig {
  name: string;
  items: TitlebarMenuItem[];
}
