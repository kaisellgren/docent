import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), vanillaExtractPlugin(), tanstackStart(), react()],
})
