/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 模型 logo 解析：管理后台存 lobe 图标名（如 doubao），也兼容 URL / 路径
 */
export function resolveModelLogoSrc(logo?: string | null): string {
  const raw = (logo || '').trim();
  if (!raw) return '';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('/') ||
    raw.startsWith('data:')
  ) {
    return raw;
  }
  const name = raw.replace(/\.svg$/i, '');
  return `/assets/icons/lobe/${name}.svg`;
}

/**
 * 已知暗色纯单色 logo 列表（如 OpenAI, Grok, Replicate 等在暗黑模式下需转为白色显示）
 */
const KNOWN_DARK_MONOCHROME_LOGOS = [
  'openai',
  'chatgpt',
  'dalle',
  'sora',
  'xai',
  'grok',
  'replicate',
  'together',
  'stability',
  'cursor',
  'github',
  'vercel',
  'v0',
  'ollama',
  'groq',
  'apple',
  'notion',
  'replit',
  'tripo',
  'runway',
  'manus',
  'devin',
  'huggingface',
  'cohere',
  'fal',
  'bfl',
  'blackforest',
  'anthropic',
  'claude',
  'moonshot',
  'kimi',
  'openrouter',
  'lmstudio',
  'lobehub',
  'newapi',
  'siliconcloud',
  'deepinfra',
  'hyperbolic',
  'cerebras',
  'sambanova',
  'nebius',
  'anyscale',
  'fireworks',
  'mistral',
  'deepseek',
  'upstage',
  'stepfun',
  'sensenova',
  'tiangong',
  'zeroone',
];

export function isKnownDarkMonochromeLogo(logo?: string | null): boolean {
  if (!logo) return false;
  const lower = logo.trim().toLowerCase();
  return KNOWN_DARK_MONOCHROME_LOGOS.some((k) => lower.includes(k));
}

/**
 * 动态通过 16x16 Canvas 采样检测图片是否为深色纯单色
 */
export function detectIsDarkMonochromeImage(img: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let nonTransparentCount = 0;
    let darkMonochromeCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 25) {
        nonTransparentCount++;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        // 亮度低且饱和度低（属于黑白灰深色单色）
        if (max < 80 && max - min < 25) {
          darkMonochromeCount++;
        }
      }
    }
    if (nonTransparentCount > 0 && darkMonochromeCount / nonTransparentCount > 0.65) {
      return true;
    }
  } catch {
    // 跨域或沙箱拦截则忽略
  }
  return false;
}

