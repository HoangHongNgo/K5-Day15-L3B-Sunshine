# Nguồn asset và dữ liệu prototype

## Dữ liệu UI

`src/data.ts` chứa tên địa điểm tham khảo PRD của nhóm và các cạnh **tự tạo để mô phỏng UI**, không phải đồ thị đường đi thật. Tên phòng chưa được xác minh tại chỗ. `src/demoPhotos.ts` dựng sẵn ba kết quả: một gợi ý, nhiều ứng viên, không nhận ra. Không dùng chúng làm ground truth hoặc kết quả đánh giá AI. Sự kiện seed có nhãn dữ liệu mẫu.

Ba file `public/images/{campus,classroom,aerial}.webp` là tranh minh hoạ tổng hợp bằng primitive SVG qua [`../scripts/render-demo-images.mjs`](../scripts/render-demo-images.mjs). Có nhãn “MINH HOẠ · MOCK”. Có thể tái tạo từ `web/` bằng `node scripts/render-demo-images.mjs`. Không chứa ảnh tour, hành lang, mặt bằng, video, vector nhận diện hay dữ liệu khảo sát trường. Các ảnh virtual tour dùng trong bản prototype cục bộ trước đây không được chuyển vào repo công khai.

`src/campusModel.ts` dựng hình khối ngoại thất bằng Three.js, lấy cảm hứng kiến trúc từ ảnh người dùng cung cấp. Bố trí/tỉ lệ được giản lược, không phải bản đồ khảo sát; không có pin địa điểm hoặc tuyến thật. Không lưu ảnh tham chiếu gốc trong repo.

## Mascot

- Boba: `public/pets/boba/pet.json` và `spritesheet.webp` do người dùng cung cấp để dùng trong prototype. Metadata là dữ liệu mô tả sprite. Không tuyên bố quyền sở hữu độc quyền hay giấy phép mở cho asset này.
- Vini: `public/pets/vini/poses.webp`, atlas 3×2 với sáu tư thế, được tạo bằng OpenAI Images API cho prototype trước khi tích hợp. Metadata ở `mascot.json`. Là ảnh 2D phong cách đồ chơi 3D, không phải mesh/rig. Không có API key hoặc file kết quả tạo thô trong repo.
- Các icon PWA là hình bản đồ riêng của ứng dụng, không phải huy hiệu VinUniversity.

## Tham khảo và thư viện

- Hound-Around: https://github.com/DxubleBTW/Hound-Around — học luồng sản phẩm, không chép source vào prototype.
- Tham chiếu UI do người dùng gửi và danh mục công khai https://appllama.io/; không sao chép mẫu trả phí.
- Nhận diện **VinUni AR Map** theo yêu cầu người dùng; Sunshine là team. Đỏ `#C4232A`, xanh `#35426E`/`#2E548A` tham khảo [bảng màu VinUni](https://vinuni.edu.vn/wp-content/uploads/2025/04/VINUNIVERSITY-BRAND-COLOUR.pdf).
- Three.js: MIT, [bản license](licenses/Three-MIT.txt).
- Lucide: ISC, [bản license](licenses/Lucide-ISC.txt).
- Be Vietnam Pro từ Fontsource: SIL OFL, [bản license](licenses/Be-Vietnam-Pro-OFL.txt).

Prototype không cung cấp bằng chứng độ chính xác, số liệu sử dụng hoặc lời chứng thực người dùng. Tất cả kết quả mô phỏng được phân biệt với dữ liệu thật.
