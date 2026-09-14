import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` sert l'app en HTTPS sur le reseau local :
// necessaire pour le partage natif (e-mail avec PDF joint) depuis un smartphone.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: { port: 5190 },
}));
