-- Existing images keep their original IDs, so saved events continue to resolve them.
ALTER TABLE public.club_mascots
  ADD COLUMN recipe jsonb,
  ALTER COLUMN image DROP NOT NULL,
  DROP CONSTRAINT club_mascots_kind_check,
  ADD CONSTRAINT club_mascots_asset_check CHECK (
    (kind = 'image' AND image IS NOT NULL)
    OR (kind = 'model3d' AND recipe IS NOT NULL AND jsonb_typeof(recipe) = 'object')
  );

NOTIFY pgrst, 'reload schema';
