import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Run with `npm run icons` after editing public/icon.svg; outputs are committed to public/.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#B5562F' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#B5562F' } },
  },
  images: ['public/icon.svg'],
})
