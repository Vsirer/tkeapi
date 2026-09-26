/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zh from './locales/zh.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import vi from './locales/vi.json';
import { getUserLanguagePreference } from './utils/language';

// ── 插件独立多语言 (动态加载) ──
const pluginLocaleFiles = import.meta.glob('./pages/Plugins/*/locales/*.json', { eager: true });

// 工具函数：将大驼峰目录名转为 snake_case (例如 AssetManager -> asset_manager)
const toSnakeCase = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');

/** 动态收集插件 namespace 注册表 */
export const pluginLocales: Record<string, Record<string, any>> = {};

Object.keys(pluginLocaleFiles).forEach((path) => {
  // path 类似于 "./pages/Plugins/AssetManager/locales/zh.json"
  const parts = path.split('/');
  if (parts.length >= 5) {
    const pluginDir = parts[3]; // "AssetManager"
    const langFile = parts[5];  // "zh.json"
    const lang = langFile.replace('.json', ''); // "zh"
    const ns = toSnakeCase(pluginDir);
    
    if (!pluginLocales[ns]) {
      pluginLocales[ns] = {};
    }
    // @ts-ignore
    pluginLocales[ns][lang] = pluginLocaleFiles[path].default || pluginLocaleFiles[path];
  }
});

// 构建 resources：将插件 locale 按 namespace 注入到每个语言下
const pluginNs = Object.keys(pluginLocales);
const resources: Record<string, Record<string, any>> = {
  en: { translation: en },
  zh: { translation: zh },
  'zh-TW': { translation: zhTW },
  ja: { translation: ja },
  ko: { translation: ko },
  vi: { translation: vi },
};

for (const ns of pluginNs) {
  for (const lng of Object.keys(pluginLocales[ns])) {
    if (!resources[lng]) resources[lng] = {};
    resources[lng][ns] = pluginLocales[ns][lng];
  }
}

// 仅使用「用户手动选择」的语言；未选择时先用 zh，等站点设置加载后再应用 default_language。
// 不再使用 LanguageDetector：它会把浏览器语言写入 localStorage，导致站点默认语言失效。
i18n.use(initReactI18next).init({
  resources,
  ns: ['translation', ...pluginNs],
  defaultNS: 'translation',
  fallbackLng: {
    'zh-TW': ['zh'],
    default: ['zh'],
  },
  lng: getUserLanguagePreference() || 'zh',
  interpolation: {
    escapeValue: false, // react already safes from xss
  },
});

export default i18n;
