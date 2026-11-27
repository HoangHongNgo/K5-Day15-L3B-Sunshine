import { chromium, expect } from '@playwright/test'

const browser = await chromium.launch({channel:'chrome'})
const base = process.env.PROTOTYPE_URL || 'http://127.0.0.1:5174'
try {
  const page = await browser.newPage()
  await page.route('**/api/destinations', route => route.fulfill({json:{rooms:[{id:'room',name:'Phòng thử'}],outdoorGeo:false}}))
  await page.route('**/api/health', route => route.fulfill({json:{ok:true,indexSize:1}}))
  await page.route('**/api/locate', route => route.fulfill({json:{
    label:'Hành lang thử', spot:'test', tier:'auto', confidence:.9, ms:123, top3:[], combined:false, photoId:'test',
  }}))
  await page.goto(base+'/anh')
  await expect(page.getByText('Chụp ảnh hành lang xung quanh để định vị trong nhà.')).toBeVisible()
  await page.getByLabel('Chọn ảnh vị trí').setInputFiles('public/icons/icon-192.png')
  await expect(page.getByText('Hành lang thử',{exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Dùng ảnh mẫu'})).toHaveCount(0)
  await page.goto(base)
  await expect(page.getByRole('link',{name:'Thử ảnh mẫu'})).toHaveCount(0)
  console.log('Upload from device completes recognition; map and camera offer no sample option.')
} finally { await browser.close() }
