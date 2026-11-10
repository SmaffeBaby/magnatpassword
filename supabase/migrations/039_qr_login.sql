-- Only the server may inspect or change QR requests. Store hashes, never bearer secrets.
CREATE TABLE public.qr_login_requests (
  id uuid PRIMARY KEY,
  scan_hash text NOT NULL UNIQUE,
  browser_hash text NOT NULL,
  verification_code text NOT NULL,
  device_label text NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'consumed', 'rejected')),
  approved_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qr_login_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_login_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.qr_login_requests TO service_role;
CREATE INDEX qr_login_expiry_idx ON public.qr_login_requests(expires_at);
