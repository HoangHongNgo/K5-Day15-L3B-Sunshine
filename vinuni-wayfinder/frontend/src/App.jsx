import { useEffect, useState } from 'react'
import Navigate from './nav/Navigate.jsx'
import Collect from './collect/Collect.jsx'
import { api } from './api.js'

// Chế độ Thu thập mở bằng #thu-thap (chỉ cho nhóm thu dữ liệu; người dùng chỉ thấy thẻ chỉ dẫn).
const modeFromHash = () => (location.hash === '#thu-thap' ? 'collect' : 'nav')

export default function App() {
  const [mode, setMode] = useState(modeFromHash)
  const [health, setHealth] = useState(null)
  useEffect(() => {
    const on = () => setMode(modeFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth({ ok: false })) }, [mode])

  return (
    <div className={'app app-' + mode}>
      <header>
        <a href="#" className="brand" onClick={() => setMode('nav')}>VinUni <span>· Chỉ đường</span></a>
        <nav>
          <a href="#" className={mode === 'nav' ? 'on' : ''}>Chỉ đường</a>
          <a href="#thu-thap" className={mode === 'collect' ? 'on' : ''}>Thu thập</a>
        </nav>
      </header>
      {health && !health.ok && <div className="alert">Không kết nối được máy chủ. Kiểm tra backend đang chạy và điện thoại cùng Wi-Fi với laptop.</div>}
      <main>{mode === 'collect' ? <Collect /> : <Navigate />}</main>
    </div>
  )
}
