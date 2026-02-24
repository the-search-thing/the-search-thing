import { z } from 'zod'

const themeSetting = z.enum(['dark', 'light'])
const fontSetting = z.enum(['sans-serif', 'serif', 'mono'])
const searchScopeSetting = z.enum(['both', 'files', 'folders'])

const generalSettingsState = z.object({
  'launch-on-startup': z.boolean(),
  theme: themeSetting,
  font: fontSetting,
  scope: searchScopeSetting,
})

const generalSettingKey = z.enum(['launch-on-startup', 'theme', 'font', 'scope'])
const generalSettingValue = z.union([z.boolean(), themeSetting, fontSetting, searchScopeSetting])

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
