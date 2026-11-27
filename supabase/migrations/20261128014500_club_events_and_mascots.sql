-- Bảng lưu sự kiện CLB và mascot tự tạo dùng chung trên Supabase.
-- Bảo mật: bật RLS và KHÔNG tạo policy công khai — chỉ khoá service của FastAPI backend đọc/ghi.

CREATE TABLE IF NOT EXISTS public.club_mascots (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,80}$' AND id NOT IN ('vini', 'boba')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  kind text NOT NULL DEFAULT 'image' CHECK (kind = 'image'),
  image text NOT NULL CHECK (
    char_length(image) <= 800000
    AND image ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$'
  ),
  brief text CHECK (brief IS NULL OR char_length(brief) <= 700),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_mascots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.club_events (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  club text NOT NULL DEFAULT '' CHECK (char_length(club) <= 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1500),
  location_id text NOT NULL DEFAULT '' CHECK (char_length(location_id) <= 80),
  starts_at text NOT NULL DEFAULT '' CHECK (char_length(starts_at) <= 40),
  ends_at text NOT NULL DEFAULT '' CHECK (char_length(ends_at) <= 40),
  mascot_id text NOT NULL DEFAULT 'vini' CHECK (char_length(mascot_id) <= 80),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
