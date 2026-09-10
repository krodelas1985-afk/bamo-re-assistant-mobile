-- Self-serve signup: the user who provisions a workspace becomes its admin.
--
-- Problem this fixes
-- ------------------
-- handle_new_user() deliberately refuses to honour a 'client_admin' role coming
-- from raw_user_meta_data, because that field is attacker-controlled at the
-- public signUp endpoint. It whitelists 'agent'/'viewer' and otherwise defaults
-- to 'agent'. That guard is correct and stays.
--
-- The consequence, though, is that a self-serve signup lands as role='agent'
-- forever. provision_workspace_on_submit() then creates their workspace and sets
-- profiles.client_id, but never touches profiles.role. So the person who owns the
-- workspace is only an 'agent' inside it, which breaks V1 end to end:
--
--   * requireClientAdmin() rejects them, so they can never connect their own
--     Facebook Page — the core V1 promise.
--   * Lead scoping fences agents to assigned_user_id = auth.uid(), so BayMo
--     reports "no leads" even when the workspace has them.
--
-- The fix is to escalate at PROVISIONING time, server-side, rather than trusting
-- signup metadata. Creating your own workspace is the act that makes you its
-- admin, and this function is SECURITY DEFINER and unreachable from the client.
--
-- Only promotes 'agent'/'viewer'. Never touches baymo_admin, and never demotes.

CREATE OR REPLACE FUNCTION public.provision_workspace_on_submit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id       uuid;
  v_existing_client uuid;
  v_name            text;
BEGIN
  IF NEW.profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT client_id INTO v_existing_client FROM public.profiles WHERE id = NEW.profile_id;
  IF v_existing_client IS NOT NULL THEN
    UPDATE public.client_onboarding
      SET client_id = v_existing_client, status = 'approved', reviewed_at = now()
      WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  v_name := COALESCE(
    NULLIF(btrim(NEW.company_name), ''),
    NULLIF(btrim(NEW.full_name), ''),
    'My Workspace'
  );

  INSERT INTO public.clients (name, company_name, email, phone, business_type, plan, is_active)
  VALUES (v_name, NEW.company_name, NEW.email, NEW.phone, NEW.business_type, 'free', true)
  RETURNING id INTO v_client_id;

  -- The only change from the previous definition: the owner of a freshly
  -- provisioned workspace is promoted to client_admin.
  UPDATE public.profiles
     SET client_id = v_client_id,
         role = CASE WHEN role IN ('agent', 'viewer') THEN 'client_admin' ELSE role END
   WHERE id = NEW.profile_id;

  UPDATE public.client_onboarding
    SET client_id = v_client_id, status = 'approved', reviewed_at = now()
    WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;
