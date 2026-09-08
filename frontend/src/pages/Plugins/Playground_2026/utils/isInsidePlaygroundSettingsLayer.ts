/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/** 属性/模型弹层、其 Select 下拉（portal） */
const SETTINGS_LAYER_SEL = [
  '.hf-msp-panel',
  '.hf-msp-trigger',
  '.pg-ui-select-trigger',
  '.pg-ui-select-content',
  '[data-radix-popper-content-wrapper]',
  '.pg-mob-sheet-container',
  '.hf-tsp-modal-root',
].join(',');

export function isInsidePlaygroundSettingsLayer(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : (target as Node | null)?.parentElement;
  return !!el?.closest(SETTINGS_LAYER_SEL);
}

/** 属性面板里的 Select 下拉已展开（portal 在面板外） */
export function isPlaygroundSelectMenuOpen(): boolean {
  return !!document.querySelector('.pg-ui-select-content, [data-radix-select-content]');
}
