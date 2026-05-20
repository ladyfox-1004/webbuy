
-- touch_updated_at: add search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- revoke direct execute on security definer functions (still callable by triggers and via RLS evaluation)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
-- authenticated may call has_role from RLS context only; keep execute for them
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
