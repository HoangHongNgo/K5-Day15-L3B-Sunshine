// Tạo file .usdz tĩnh cho mascot có sẵn để iPhone AR Quick Look mở qua HTTPS (vào được tab AR).
// Kèm một khối hộp đơn giản làm mẫu đối chứng cho trang thử /ar/test.html.
// Chạy lại khi mô hình Tia thay đổi: npm run build:ar
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { defaultEventMascot } from '../src/features/events/events'
import { exportMascotUsdz } from '../src/features/events/mascotAr'

const dir = resolve(import.meta.dirname, '../public/ar')
const tia = await exportMascotUsdz(defaultEventMascot)
writeFileSync(resolve(dir, 'tia3d.usdz'), tia)

const scene = new THREE.Scene()
const box = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2), new THREE.MeshStandardMaterial({ color: 0xe0383e, roughness: .5 }))
box.position.y = .1
scene.add(box)
const cube = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true })
writeFileSync(resolve(dir, 'test-cube.usdz'), cube)
console.log(`Đã ghi tia3d.usdz (${(tia.byteLength / 1024).toFixed(0)} KB) và test-cube.usdz (${(cube.byteLength / 1024).toFixed(0)} KB) vào ${dir}`)
