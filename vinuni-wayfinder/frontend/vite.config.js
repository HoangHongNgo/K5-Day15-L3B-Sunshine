import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS tự ký: điện thoại cần HTTPS để dùng camera, GPS, la bàn, cảm biến bước chân.
// Mọi lời gọi /api và /maps đi qua proxy sang backend (http://127.0.0.1:8000) để không bị mixed content.
const backend = 'http://127.0.0.1:8000'

// `npm run dev:http` (mode "http") bỏ HTTPS — chỉ để thử trên laptop, camera/cảm biến điện thoại sẽ không chạy.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'http' ? [react()] : [react(), basicSsl()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': backend, '/maps': backend },
  },
}))
