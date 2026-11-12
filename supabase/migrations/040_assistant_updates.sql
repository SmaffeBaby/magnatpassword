CREATE TABLE public.assistant_updates (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  revision integer NOT NULL DEFAULT 1,
  posts jsonb NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE public.assistant_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_updates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.assistant_updates TO service_role;
INSERT INTO public.assistant_updates (id) VALUES (true);
