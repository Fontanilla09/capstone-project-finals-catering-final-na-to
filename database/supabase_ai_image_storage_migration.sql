-- Private storage for generated and reference images used by the AI image tools.
-- Run after supabase_schema.sql. Server-side functions access this bucket with the service role key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'ai-visualizations',
    'ai-visualizations',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;