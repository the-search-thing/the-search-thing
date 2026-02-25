import { z } from 'zod'

const themeSetting = z.enum(['dark', 'light'])
const fontSetting = z.enum(['sans-serif', 'mono'])
const searchScopeSetting = z.enum(['both', 'files', 'folders'])
const windowPlacementSetting = z.enum(['center', 'center-above', 'center-below', 'cursor'])

const generalSettingsState = z.object({
  'launch-on-startup': z.boolean(),
  theme: themeSetting,
  font: fontSetting,
  scope: searchScopeSetting,
  'window-placement': windowPlacementSetting,
})

const generalSettingKey = z.enum(['launch-on-startup', 'theme', 'font', 'scope', 'window-placement'])
const generalSettingValue = z.union([
  z.boolean(),
  themeSetting,
  fontSetting,
  searchScopeSetting,
  windowPlacementSetting,
])

export const generalSettingsIpcSchema = {
  'general-settings/get': {
    args: z.tuple([]),
    return: generalSettingsState,
  },
  'general-settings/set': {
    args: z.tuple([generalSettingsState]),
    return: generalSettingsState,
  },
  'general-settings/update': {
    args: z.tuple([generalSettingKey, generalSettingValue]),
    return: generalSettingsState,
  },
  'general-settings/reset': {
    args: z.tuple([]),
    return: generalSettingsState,
  },
} as const
