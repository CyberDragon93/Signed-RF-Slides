import { loadNodeIcon } from '@iconify/utils/lib/loader/node-loader'
import { encodeSvgForCss } from '@iconify/utils/lib/svg/encode-svg-for-css'
import { defineConfig } from 'unocss'

const iconCollections = ['carbon', 'ph', 'svg-spinners']

function parseIconToken(raw: string) {
  const token = raw.slice(2)
  if (token.includes(':')) {
    return token.split(':', 2)
  }

  const parts = token.split('-')
  for (let i = 3; i >= 1; i -= 1) {
    const collection = parts.slice(0, i).join('-')
    if (iconCollections.includes(collection)) {
      return [collection, parts.slice(i).join('-')]
    }
  }
}

async function iconMask(raw: string) {
  const parsed = parseIconToken(raw)
  if (!parsed) {
    return
  }

  const [collection, name] = parsed
  const svg = await loadNodeIcon(collection, name)
  if (!svg) {
    return
  }

  const url = `url("data:image/svg+xml;utf8,${encodeSvgForCss(svg)}")`
  return {
    '--un-icon': url,
    '-webkit-mask': 'var(--un-icon) no-repeat',
    mask: 'var(--un-icon) no-repeat',
    '-webkit-mask-size': '100% 100%',
    'mask-size': '100% 100%',
    'background-color': 'currentColor',
    color: 'inherit',
    width: '1em',
    height: '1em',
  }
}

export default defineConfig({
  rules: [
    [/^i-(carbon|ph|svg-spinners)[:-][\w:-]+$/, ([raw]) => iconMask(raw)],
  ],
  safelist: [
    'i-carbon-camera',
    'i-carbon-magic-wand',
    'i-carbon-magic-wand-filled',
    'i-carbon-moon',
    'i-carbon-sun',
    'i-carbon:account',
    'i-carbon:align-box-bottom-right',
    'i-carbon:apps',
    'i-carbon:arrow-down',
    'i-carbon:arrow-left',
    'i-carbon:arrow-right',
    'i-carbon:arrow-up',
    'i-carbon:arrow-up-right',
    'i-carbon:catalog',
    'i-carbon:checkbox',
    'i-carbon:checkmark',
    'i-carbon:chevron-up',
    'i-carbon:close',
    'i-carbon:close-outline',
    'i-carbon:cursor-1',
    'i-carbon:document-pdf',
    'i-carbon:download',
    'i-carbon:drop-photo',
    'i-carbon:edit',
    'i-carbon:erase',
    'i-carbon:error',
    'i-carbon:help',
    'i-carbon:information',
    'i-carbon:launch',
    'i-carbon:list-boxes',
    'i-carbon:logo-twitter',
    'i-carbon:maximize',
    'i-carbon:minimize',
    'i-carbon:open-panel-bottom',
    'i-carbon:open-panel-right',
    'i-carbon:pause',
    'i-carbon:pen',
    'i-carbon:pin',
    'i-carbon:pin-filled',
    'i-carbon:play',
    'i-carbon:presentation-file',
    'i-carbon:previous-outline',
    'i-carbon:radio-button',
    'i-carbon:redo',
    'i-carbon:renew',
    'i-carbon:settings-adjust',
    'i-carbon:stop-outline',
    'i-carbon:template',
    'i-carbon:text-annotation-toggle',
    'i-carbon:time',
    'i-carbon:timer',
    'i-carbon:trash-can',
    'i-carbon:undo',
    'i-carbon:user-avatar',
    'i-carbon:user-speaker',
    'i-carbon:video',
    'i-carbon:warning-alt',
    'i-carbon:zoom-in',
    'i-carbon:zoom-out',
    'i-ph-cursor-duotone',
    'i-ph-cursor-fill',
    'i-ph:arrow-down-bold',
    'i-ph:arrow-up-bold',
    'i-svg-spinners-90-ring-with-bg',
  ],
})
