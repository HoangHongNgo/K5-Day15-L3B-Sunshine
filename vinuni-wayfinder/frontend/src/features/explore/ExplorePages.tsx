import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Bookmark, DoorOpen, ExternalLink, MapPin, Navigation, ShieldCheck } from 'lucide-react'
import { BackLink, DemoNote, EmptyState, Modal, NotFound, PlaceIcons, PlaceRow } from '../../shared/ui'
import { SaveButton, useFavorites } from '../../shared/FavoritesContext'
import { Mascot } from '../mascot/Mascot'
import type { Place } from '../wayfinder/data'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import ExploreMap from './ExploreMap'

export function ExplorePage() {
  const { places, isLive } = useWayfinder()
  const [hello, setHello] = useState(false)
  const sampleTarget = places[0]?.id ?? 'i109'
  return (
    <>
      <ExploreMap save={place => <SaveButton place={place} />} onHello={() => setHello(true)} />
      {hello && (
        <Modal title="Chào bạn, mình là Vini!" onClose={() => setHello(false)}>
          <div className="mascot-greeting">
            <Mascot mood="wave" size={144} />
            <p>Mình là bạn đồng hành trên VinUni AR Map.<br />Cùng khám phá khuôn viên nhé!</p>
          </div>
          <Link className="button button-primary full-width" to={`/di-den?to=${sampleTarget}`}>
            Thử một hành trình<ArrowUpRight size={19} />
          </Link>
          <p className="helper-text greeting-note">
            {isLive ? 'Đã kết nối backend VinUni Wayfinder.' : 'Vini đang dẫn bạn qua tuyến mẫu. Chưa có định vị trực tiếp.'}
          </p>
        </Modal>
      )}
    </>
  )
}

export function PlaceDetailPage() {
  const { getPlace } = useWayfinder()
  const { id } = useParams()
  const place = getPlace(id)
  if (!place) return <NotFound />
  const Icon = PlaceIcons[place.icon]
  return (
    <div className="focused-page">
      <BackLink />
      <div className="detail-layout">
        <section className="place-detail">
          <div className={`detail-symbol tone-${place.category}`}><Icon size={62} strokeWidth={1.25} aria-hidden="true" /></div>
          <div className="detail-title"><h1 tabIndex={-1}>{place.name}</h1><SaveButton place={place} /></div>
          <p className="page-intro">{place.description}</p>
          <div className="detail-facts">
            <span><MapPin size={18} />{place.building ?? 'Toà I'}</span>
            <span><DoorOpen size={18} />{place.code ? `Mã ${place.code}` : 'Tầng trệt'}</span>
          </div>
          <Link to={`/di-den?to=${place.id}`} className="button button-primary"><Navigation size={19} />Dẫn đường tới đây</Link>
        </section>
        <aside className="detail-aside">
          <h2>Trước khi bắt đầu</h2>
          <p>{place.detail}</p>
          <DemoNote />
          <div className="line-divider" />
          <h2>Một điểm đến, từng bước nhỏ</h2>
          <p>Chọn điểm xuất phát, xem trước hành trình và đi qua từng chặng.</p>
          <Link className="text-link" to="/ve-ung-dung">Tìm hiểu bản trải nghiệm<ArrowUpRight size={17} /></Link>
        </aside>
      </div>
    </div>
  )
}

export function SavedPage() {
  const { getPlace } = useWayfinder()
  const { saved } = useFavorites()
  const savedPlaces = saved.map(id => getPlace(id)).filter((p): p is Place => Boolean(p))
  return (
    <div className="narrow-page">
      <h1 tabIndex={-1}>Những nơi muốn quay lại</h1>
      <p className="page-intro">Góc học quen, điểm hẹn, và những nơi của bạn.</p>
      {savedPlaces.length ? (
        <div className="saved-list">{savedPlaces.map(place => <PlaceRow key={place.id} place={place} />)}</div>
      ) : (
        <EmptyState
          title="Góc quen của bạn ở đây"
          description="Chạm biểu tượng lưu bên cạnh một địa điểm để lần sau tìm nhanh hơn."
          action={<Link className="button button-primary" to="/">Mở bản đồ<ArrowRight size={18} /></Link>}
        >
          <Bookmark size={42} strokeWidth={1.3} />
        </EmptyState>
      )}
      <p className="privacy-note"><ShieldCheck size={17} />Lưu trên thiết bị này. Không cần đăng nhập.</p>
    </div>
  )
}

export function AboutPage() {
  return (
    <div className="narrow-page about-page">
      <BackLink />
      <h1 tabIndex={-1}>Về VinUni AR Map</h1>
      <p className="page-intro">Khám phá khuôn viên, tìm phòng và trải nghiệm dẫn đường tại VinUni. Phát triển bởi team Sunshine.</p>
      <section><h2>Vini và khuôn viên thu nhỏ</h2><p>Mô hình 3D minh hoạ kiến trúc toà trung tâm theo ảnh tham chiếu. Bố trí và tỉ lệ là minh hoạ kiến trúc; mô hình không biểu thị vị trí hoặc tuyến đi thực tế. Vini là mascot cáo được tạo bằng OpenAI Image API, dùng ảnh 2D phong cách 3D với các tư thế và chuyển động theo trạng thái giao diện. Chưa có AR neo vào không gian thật hoặc định vị liên tục.</p></section>
      <section><h2>Bạn có thể thử gì?</h2><p>Tìm và lưu địa điểm, chụp hoặc tải ảnh để định vị trong nhà và xác nhận điểm xuất phát, chọn điểm xuất phát, đi qua từng chặng, chọn ảnh từ camera và mở lại bản thử khi mất mạng sau khi ứng dụng đã được tải đầy đủ.</p></section>
      <section><h2>Kết nối backend Wayfinder</h2><p>Khi máy chủ VinUni Wayfinder hoạt động cùng origin (qua proxy dev hoặc reverse proxy), ứng dụng tự động tải danh mục phòng từ <code>/api/destinations</code>, nhận diện ảnh qua <code>/api/locate</code>, tìm điểm trong nhà qua <code>/api/spots/search</code> và lấy chỉ dẫn từng bước từ <code>/api/route</code>. Khi không có máy chủ hoặc mất mạng, ứng dụng giữ chế độ mô phỏng ngoại tuyến.</p></section>
      <section><h2>Ảnh đến từ đâu?</h2><p>Bạn có thể chụp ảnh hành lang hoặc chọn ảnh từ thiết bị. Wayfinder đối chiếu ảnh với các điểm đã thu thập.</p><a href="https://vinuni.edu.vn/virtual-tour/index.html" target="_blank" rel="noreferrer" className="text-link">Khám phá virtual tour VinUni<ExternalLink size={16} /></a></section>
      <section><h2>Dữ liệu của bạn</h2><p>Ảnh gửi định vị được thu nhỏ, xoá siêu dữ liệu EXIF và không lưu ảnh gốc trên máy chủ. Địa điểm đã lưu, sự kiện và mascot được chọn được giữ trên trình duyệt này. Khi bạn bấm tạo mascot AI, tên CLB và mô tả nhân vật được gửi tới OpenAI qua máy chủ; API key không được đưa vào trình duyệt.</p></section>
    </div>
  )
}
