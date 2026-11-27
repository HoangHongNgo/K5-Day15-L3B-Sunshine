-- Nền tảng Dẫn Đường Sự Kiện VinUni:
-- 1) Tài khoản & phiên đăng nhập BTC (admin_truong | clb) — bật RLS, chỉ service key đọc/ghi
-- 2) Mở rộng club_events với stops (multi-stop JSONB), owner_id, views_count, navigations_count
-- 3) Mở rộng club_mascots với owner_id
-- 4) Hàm RPC increment_event_metric tăng bộ đếm ẩn danh nguyên tử

CREATE TABLE IF NOT EXISTS public.club_accounts (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.-]{3,40}$'),
  password_hash text NOT NULL,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  club_name text NOT NULL DEFAULT '' CHECK (char_length(club_name) <= 80),
  role text NOT NULL DEFAULT 'clb' CHECK (role IN ('admin_truong', 'clb')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.club_sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES public.club_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.club_events
  ADD COLUMN IF NOT EXISTS stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS owner_id text REFERENCES public.club_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  ADD COLUMN IF NOT EXISTS navigations_count integer NOT NULL DEFAULT 0 CHECK (navigations_count >= 0);

ALTER TABLE public.club_mascots
  ADD COLUMN IF NOT EXISTS owner_id text REFERENCES public.club_accounts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.increment_event_metric(p_event_id text, p_metric text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_views integer;
  v_navs integer;
BEGIN
  IF p_metric = 'view' THEN
    UPDATE public.club_events
    SET views_count = views_count + 1
    WHERE id = p_event_id
    RETURNING views_count, navigations_count INTO v_views, v_navs;
  ELSIF p_metric = 'navigation' THEN
    UPDATE public.club_events
    SET navigations_count = navigations_count + 1
    WHERE id = p_event_id
    RETURNING views_count, navigations_count INTO v_views, v_navs;
  ELSE
    RAISE EXCEPTION 'invalid_metric: %', p_metric;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('viewsCount', v_views, 'navigationsCount', v_navs);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_event_metric(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_event_metric(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
