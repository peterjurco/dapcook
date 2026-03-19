-- Create public recipe-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload recipe images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recipe-images');

-- Public read (bucket is public so URLs work without auth)
CREATE POLICY "Public read for recipe images"
ON storage.objects FOR SELECT
USING (bucket_id = 'recipe-images');

-- Authenticated users can delete (e.g. replacing an image)
CREATE POLICY "Authenticated users can delete recipe images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'recipe-images');
