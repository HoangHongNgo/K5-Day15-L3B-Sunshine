// Tạo file .usdz tĩnh cho mascot có sẵn để iPhone AR Quick Look mở qua HTTPS (vào được tab AR).
// Chạy lại khi mô hình Tia thay đổi: npm run build:ar
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defaultEventMascot } from '../src/features/events/events'
import { exportMascotUsdz } from '../src/features/events/mascotAr'

const out = resolve(import.meta.dirname, '../public/ar/tia3d.usdz')
const data = await exportMascotUsdz(defaultEventMascot)
writeFileSync(out, data)
console.log(`Đã ghi ${out} (${(data.byteLength / 1024).toFixed(0)} KB)`)
