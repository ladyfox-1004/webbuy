CREATE POLICY "Anyone can upload inquiry files"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'inquiry-files');