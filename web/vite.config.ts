import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En production (GitHub Pages) l'appli est servie sous /Taches-Famille/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/Taches-Famille/' : '/',
}))
