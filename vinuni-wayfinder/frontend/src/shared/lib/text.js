// So khớp tìm kiếm không phân biệt dấu tiếng Việt và hoa/thường.
export const fold = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()

export function matchRooms(rooms, q) {
  const f = fold(q)
  if (!f) return rooms
  return rooms
    .map((r) => {
      const hay = [r.code, r.name, ...(r.aliases || [])].map(fold)
      const exact = hay.some((h) => h === f)
      const starts = hay.some((h) => h.startsWith(f))
      const has = hay.some((h) => h.includes(f))
      return { r, score: exact ? 3 : starts ? 2 : has ? 1 : 0 }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
}
