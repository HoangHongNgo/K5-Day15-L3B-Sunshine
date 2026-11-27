import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function usePwa() {
  const [online, setOnline] = useState(navigator.onLine)
  const [error, setError] = useState('')
  const sw = useRegisterSW({ onRegisterError: () => setError('Chưa lưu được bản ngoại tuyến. Bạn vẫn có thể dùng khi có mạng.') })
  useEffect(() => {
    const onlineChange = () => setOnline(navigator.onLine)
    window.addEventListener('online', onlineChange)
    window.addEventListener('offline', onlineChange)
    return () => {
      window.removeEventListener('online', onlineChange)
      window.removeEventListener('offline', onlineChange)
    }
  }, [])
  return { ...sw, online, error }
}
