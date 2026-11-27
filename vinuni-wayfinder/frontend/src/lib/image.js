// Thu ảnh về cạnh dài 512px và vẽ lại qua canvas: bỏ EXIF/GPS/metadata trước khi gửi.
export async function prepPhoto(file, maxSide = 512) {
  let bmp
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bmp = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Không đọc được ảnh'))
      img.src = URL.createObjectURL(file)
    })
  }
  const w = bmp.width, h = bmp.height
  const s = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * s)
  canvas.height = Math.round(h * s)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
}
