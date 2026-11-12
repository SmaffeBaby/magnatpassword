-- Refresh PostgREST's schema cache after adding the assistant update feed.
NOTIFY pgrst, 'reload schema';
