// Scripted UI scenarios with synthetic illustrations, not photos or recognition evidence.
export const demoPhotos = [
  { id: 'campus', title: 'Kiến trúc khuôn viên', image: '/images/campus.webp', alt: 'Minh hoạ kiến trúc giả lập, không phải ảnh VinUni', scenario: 'match', label: 'Có vị trí gợi ý', caption: 'Xem kết quả và xác nhận nơi bạn đang đứng.', candidates: ['lobby'] },
  { id: 'classroom', title: 'Không gian học tập', image: '/images/classroom.webp', alt: 'Minh hoạ lớp học giả lập, không phải ảnh phòng thật', scenario: 'choices', label: 'Cần bạn xác nhận', caption: 'Chọn giữa các vị trí có thể giống nhau.', candidates: ['study', 'i109', 'startup'] },
  { id: 'aerial', title: 'Cảnh quan minh hoạ', image: '/images/aerial.webp', alt: 'Tranh cảnh quan giả lập, không có dữ liệu vị trí', scenario: 'unknown', label: 'Chưa nhận ra vị trí', caption: 'Thử ảnh khác hoặc nhập điểm xuất phát.', candidates: [] },
] as const
export type DemoPhoto = typeof demoPhotos[number]
export const getDemoPhoto = (id: string | null | undefined) => demoPhotos.find(photo => photo.id === id)
