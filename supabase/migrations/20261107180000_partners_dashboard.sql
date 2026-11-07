-- 추천인(파트너) 지급 편의 + 파트너 로그인 대시보드 — 11/7 대표님 결정·요청(20261107170000_partners_followup.sql 다음에 적용)
--
-- A) 지급 편의
--   1) 정산 계좌 스냅샷: partner_payouts.pay_bank_name · pay_bank_account · pay_bank_holder
--      정산을 만들 때 그 순간의 partners 계좌를 적어 둔다. 만든 뒤 파트너가 계좌를 바꿔도 그 정산은 그대로(대량이체 파일·지급 표시 기준).
--      이미 있던 정산 행은 이 마이그레이션에서 지금 partners 값으로 채운다.
--   2) 매월 1일 정산 자동 생성: partner_payout_runs(달마다 한 줄 = 멱등) + partner_auto_payouts(_now)
--      한국 시간 1일 09:00 이후 처음 부를 때만 지난달 이름으로 partner_make_payouts 를 돌린다(같은 달 두 번 안 만든다).
--      부르는 곳: 워커 예약 실행 "*/30 * * * *"(src/server/partner-tasks/auto-payouts-task.ts). 카톡은 워커가 보낸다.
--   3) 내려받기 자료: partner_transfer_list(_month) — 그 달 지급 전 정산(스냅샷 계좌)
--                    partner_paid_list(_from, _to) — 지급일이 기간 안인 지급 완료 정산(원천징수 지급 내역)
--
-- B) 파트너 로그인 대시보드
--   1) 계정: partners.user_id(auth.users, UNIQUE). 계정은 서버가 service role admin.createUser(email_confirm) 로 만들고,
--      승인 때 만든 view_key 로 본인 확인 뒤 partner_link_user 로 연결한다. 브라우저에 RLS 정책은 열지 않는다(정책 0개 그대로).
--      계정 만들기 안내 메일 기록: partners.account_mail_sent_at · account_mail_error
--   2) 대시보드·정보 수정·계좌 변경은 서버가 Supabase 세션 토큰 → user id 를 확인한 뒤 아래 함수로만 한다.
--      대시보드 응답에 계좌 전체 번호는 넣지 않는다(끝 4자리만).
--   3) 계좌 변경 이력: partner_account_changes(바뀐 시각·옛/새 은행·옛/새 끝 4자리·user agent 요약). 대표님 카톡은 서버가 보낸다.
--
-- 함수 계약(service_role 전용, jsonb 반환)
--   partner_account_target(_view_key)                → {ok:true, id, name, email, status, has_account} | {ok:false, reason:'not_found'}
--   partner_link_user(_view_key, _user_id, _email)   → {ok:true, id} | {ok:false, reason:'not_found'|'already_linked'|'user_taken'|'email_mismatch'}
--   partner_session(_user_id)                        → {partner:true, id, code, name, status} | {partner:false}
--   partner_dashboard(_user_id, _period, _now)       → {...} | null   (_period: '7d'|'30d'|'month')
--   partner_update_profile(_user_id, _phone, _channels) → {ok:true, phone, channels} | {ok:false, reason:'not_found'|'invalid'|'phone_taken'}
--   partner_change_account(_user_id, _bank_name, _bank_account, _bank_holder, _user_agent, _now)
--                                                    → {ok:true, name, bank_name, old_last4, new_last4, changed_at} | {ok:false, reason:'not_found'|'invalid'|'same'}
--   partner_account_mail_target(_id)                 → {ok:true, name, email, view_key} | {ok:false, reason:'not_found'|'not_approved'|'has_account'}
--   partner_account_mail_result(_id, _error, _now)   → {ok:true} | {ok:false, reason:'not_found'}
--   partner_admin_overview: partners 에 user_linked · account_mail_sent_at · account_mail_error · last_account_change_at 추가
--
-- 함수 계약(service_role 전용, jsonb 반환) — A
--   partner_auto_payouts(_now)                       → {ok:true, due:false}
--                                                    | {ok:true, due:true, created, run_month, payout_month, partners, net_total, notify}
--      notify=true 이면 워커가 카톡을 보내고 partner_auto_payouts_notified 로 결과를 적는다(실패면 다음 실행에 다시, 최대 3번).
--   partner_auto_payouts_notified(_run_month, _status, _now) → {ok:true} | {ok:false, reason:'not_found'}
--   partner_transfer_list(_month)                    → [{id, month, code, partner_name, gross, net, bank_name, bank_account, bank_holder}]
--   partner_paid_list(_from, _to)                    → [{id, month, paid_at, partner_name, phone, gross, income_tax, local_tax, withholding, net, bank_name, bank_account, bank_holder}]
--   partner_make_payouts: 새 정산 행에 계좌 스냅샷을 채운다(그 밖의 동작은 20261107170000 과 같다)
--   partner_admin_overview: payouts 의 bank_* 는 스냅샷 값, account_changed(만든 뒤 계좌가 바뀜) 추가
--
-- 시험: supabase/tests/partners_dashboard.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── A1) 정산 계좌 스냅샷 ─────────
ALTER TABLE public.partner_payouts
  ADD COLUMN pay_bank_name text,
  ADD COLUMN pay_bank_account text,
  ADD COLUMN pay_bank_holder text;

UPDATE public.partner_payouts y
   SET pay_bank_name = p.bank_name, pay_bank_account = p.bank_account, pay_bank_holder = p.bank_holder
  FROM public.partners p
 WHERE p.id = y.partner_id AND y.pay_bank_name IS NULL;

ALTER TABLE public.partner_payouts
  ALTER COLUMN pay_bank_name SET NOT NULL,
  ALTER COLUMN pay_bank_account SET NOT NULL,
  ALTER COLUMN pay_bank_holder SET NOT NULL;

-- 정산 만들기: 20261107170000 과 같고, 새 행에 그때의 계좌를 적는다.
CREATE OR REPLACE FUNCTION public.partner_make_payouts(_month text, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_id uuid;
  v_status text;
  v_gross integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_carried integer := 0;
BEGIN
  IF _month IS NULL OR _month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_month');
  END IF;
  PERFORM public.partner_refresh_payable(_now);

  FOR r IN SELECT partner_id, sum(amount)::integer AS s FROM public.partner_commissions
            WHERE status = 'payable' AND payout_id IS NULL
            GROUP BY partner_id ORDER BY partner_id LOOP
    v_id := NULL; v_status := NULL; v_gross := NULL;
    SELECT id, status, gross INTO v_id, v_status, v_gross FROM public.partner_payouts
     WHERE partner_id = r.partner_id AND month = _month FOR UPDATE;
    IF v_status = 'paid' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF coalesce(v_gross, 0) + r.s <= 0 THEN
      v_carried := v_carried + 1;
      CONTINUE;
    END IF;
    IF v_id IS NULL THEN
      INSERT INTO public.partner_payouts
        (partner_id, month, created_at, pay_bank_name, pay_bank_account, pay_bank_holder)
      SELECT r.partner_id, _month, _now, p.bank_name, p.bank_account, p.bank_holder
        FROM public.partners p WHERE p.id = r.partner_id
      RETURNING id INTO v_id;
      v_created := v_created + 1;
    ELSE
      -- 이미 있는 지급 전 정산에 더할 때도 계좌는 처음 만들 때 그대로 둔다
      v_updated := v_updated + 1;
    END IF;
    UPDATE public.partner_commissions SET payout_id = v_id
     WHERE partner_id = r.partner_id AND status = 'payable' AND payout_id IS NULL;
    PERFORM public._partner_payout_recalc(v_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'partners', v_created + v_updated, 'created', v_created,
                            'updated', v_updated, 'skipped_paid', v_skipped, 'carried', v_carried);
END;
$$;

-- ───────── A2) 매월 1일 정산 자동 생성 ─────────
-- run_month = 실행한 달(한국 시간), payout_month = 정산 이름(지난달). 한 달에 한 줄 → 두 번 안 만든다.
CREATE TABLE public.partner_payout_runs (
  run_month        text PRIMARY KEY CHECK (run_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  payout_month     text NOT NULL CHECK (payout_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ran_at           timestamptz NOT NULL DEFAULT now(),
  result           jsonb NOT NULL DEFAULT '{}'::jsonb,
  partners         integer NOT NULL DEFAULT 0 CHECK (partners >= 0),
  net_total        integer NOT NULL DEFAULT 0,
  notify_attempts  integer NOT NULL DEFAULT 0 CHECK (notify_attempts >= 0),
  notified_at      timestamptz,
  notify_status    text CHECK (notify_status IS NULL OR char_length(notify_status) <= 200)
);
ALTER TABLE public.partner_payout_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_payout_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.partner_payout_runs TO service_role;

-- 카톡은 정산이 1명 이상일 때만, 실패하면 다음 실행에 다시(최대 3번)
CREATE FUNCTION public.partner_auto_payouts(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 한국은 서머타임이 없다 → UTC + 9시간
  v_kst timestamp := (_now AT TIME ZONE 'UTC') + interval '9 hours';
  v_run text;
  v_pay text;
  v_n integer;
  v_res jsonb;
  v_cnt integer;
  v_sum integer;
  x public.partner_payout_runs%ROWTYPE;
  v_notify boolean := false;
BEGIN
  IF extract(day FROM v_kst) <> 1 OR extract(hour FROM v_kst) < 9 THEN
    RETURN jsonb_build_object('ok', true, 'due', false);
  END IF;
  v_run := to_char(v_kst, 'YYYY-MM');
  v_pay := to_char(v_kst - interval '1 month', 'YYYY-MM');

  INSERT INTO public.partner_payout_runs (run_month, payout_month, ran_at)
  VALUES (v_run, v_pay, _now)
  ON CONFLICT (run_month) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 1 THEN
    v_res := public.partner_make_payouts(v_pay, _now);
    SELECT count(*)::integer, coalesce(sum(net), 0)::integer INTO v_cnt, v_sum
      FROM public.partner_payouts WHERE month = v_pay AND status = 'pending';
    UPDATE public.partner_payout_runs SET result = v_res, partners = v_cnt, net_total = v_sum
     WHERE run_month = v_run;
  END IF;

  SELECT * INTO x FROM public.partner_payout_runs WHERE run_month = v_run FOR UPDATE;
  IF x.partners > 0 AND x.notified_at IS NULL AND x.notify_attempts < 3 THEN
    -- 보낼 차례를 여기서 잡는다(동시에 두 번 불려도 한 번만 true)
    UPDATE public.partner_payout_runs SET notify_attempts = notify_attempts + 1 WHERE run_month = v_run;
    v_notify := true;
  END IF;

  RETURN jsonb_build_object('ok', true, 'due', true, 'created', v_n = 1,
                            'run_month', x.run_month, 'payout_month', x.payout_month,
                            'partners', x.partners, 'net_total', x.net_total, 'notify', v_notify);
END;
$$;

-- _status: 'ok' = 보냄(시각 적음) / 그 밖('failed:…'·'skipped:…') = 사유만 적고 다음 실행에 다시(최대 3번)
CREATE FUNCTION public.partner_auto_payouts_notified(_run_month text, _status text, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.partner_payout_runs
     SET notify_status = left(coalesce(_status, ''), 200),
         notified_at = CASE WHEN _status = 'ok' THEN _now ELSE notified_at END
   WHERE run_month = _run_month;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ───────── A3) 내려받기 자료 ─────────
-- 대량이체: 그 달 지급 전 정산. 계좌는 스냅샷.
CREATE FUNCTION public.partner_transfer_list(_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF _month IS NULL OR _month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x.partner_name, x.code), '[]'::jsonb) INTO v FROM (
    SELECT y.id, y.month, p.code, p.name AS partner_name, y.gross, y.net,
           y.pay_bank_name AS bank_name, y.pay_bank_account AS bank_account, y.pay_bank_holder AS bank_holder
      FROM public.partner_payouts y
      JOIN public.partners p ON p.id = y.partner_id
     WHERE y.month = _month AND y.status = 'pending'
  ) x;
  RETURN v;
END;
$$;

-- 원천징수 지급 내역: 지급일(paid_at)이 [_from, _to) 인 지급 완료 정산. 이름·연락처는 지금 값, 계좌는 스냅샷.
CREATE FUNCTION public.partner_paid_list(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF _from IS NULL OR _to IS NULL OR _to <= _from OR _to - _from > interval '400 days' THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x.paid_at, x.partner_name), '[]'::jsonb) INTO v FROM (
    SELECT y.id, y.month, y.paid_at, p.name AS partner_name, p.phone, y.gross, y.income_tax, y.local_tax,
           y.withholding, y.net,
           y.pay_bank_name AS bank_name, y.pay_bank_account AS bank_account, y.pay_bank_holder AS bank_holder
      FROM public.partner_payouts y
      JOIN public.partners p ON p.id = y.partner_id
     WHERE y.status = 'paid' AND y.paid_at >= _from AND y.paid_at < _to
  ) x;
  RETURN v;
END;
$$;

-- ───────── B1) 계정 연결·계정 안내 메일 기록·계좌 변경 이력(표·열) ─────────
-- 관리자 화면 묶음(A4)이 이 열·표를 읽으므로 먼저 만든다.
ALTER TABLE public.partners
  ADD COLUMN user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN account_mail_sent_at timestamptz,
  ADD COLUMN account_mail_error text CHECK (account_mail_error IS NULL OR char_length(account_mail_error) <= 500);

CREATE TABLE public.partner_account_changes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  old_bank_name  text,
  new_bank_name  text NOT NULL,
  old_last4      text CHECK (old_last4 IS NULL OR old_last4 ~ '^[0-9]{0,4}$'),
  new_last4      text NOT NULL CHECK (new_last4 ~ '^[0-9]{1,4}$'),
  user_agent     text CHECK (user_agent IS NULL OR char_length(user_agent) <= 120)
);
CREATE INDEX partner_account_changes_partner_idx ON public.partner_account_changes (partner_id, changed_at DESC);
ALTER TABLE public.partner_account_changes ENABLE ROW LEVEL SECURITY;
-- 정책은 일부러 만들지 않는다(브라우저는 직접 못 읽는다)
REVOKE ALL ON public.partner_account_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.partner_account_changes TO service_role;

-- ───────── A4) 관리자 화면: 정산 계좌는 스냅샷(+ B 계정 연결·계정 메일·계좌 변경 시각) ─────────
CREATE OR REPLACE FUNCTION public.partner_admin_overview(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partners jsonb;
  v_inq jsonb;
  v_comm jsonb;
  v_pay jsonb;
BEGIN
  PERFORM public.partner_refresh_payable(_now);

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_partners FROM (
    SELECT p.id, p.code, p.status, p.name, p.phone, p.email, p.channels, p.bank_name, p.bank_account, p.bank_holder,
           p.created_at, p.approved_at, p.view_key, p.memo, p.approval_mail_sent_at, p.approval_mail_error,
           (p.user_id IS NOT NULL) AS user_linked, p.account_mail_sent_at, p.account_mail_error,
           (SELECT max(ac.changed_at) FROM public.partner_account_changes ac WHERE ac.partner_id = p.id) AS last_account_change_at,
           (SELECT count(DISTINCT v.visitor_id) FROM public.site_visits v
             WHERE v.ref_code = p.code AND v.created_at >= _now - interval '30 days') AS visits_30d,
           (SELECT count(*) FROM public.inquiries i WHERE i.ref_code = p.code) AS inquiries,
           (SELECT count(*) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status <> 'cancelled' AND c.reversal_of IS NULL) AS paid_count,
           (SELECT coalesce(sum(c.amount), 0) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status = 'pending') AS sum_pending,
           (SELECT coalesce(sum(c.amount), 0) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status = 'payable') AS sum_payable,
           (SELECT coalesce(sum(c.amount), 0) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status = 'paid') AS sum_paid
      FROM public.partners p
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_inq FROM (
    SELECT i.id, i.created_at, i.name, i.services, i.ref_code,
           p.name AS partner_name, p.status AS partner_status,
           c.id AS commission_id, c.base_amount, c.amount AS commission, c.status AS commission_status,
           (c.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.partner_commissions rv WHERE rv.reversal_of = c.id)) AS reversed
      FROM public.inquiries i
      LEFT JOIN public.partners p ON p.code = i.ref_code
      LEFT JOIN LATERAL (
        SELECT * FROM public.partner_commissions pc
         WHERE pc.inquiry_id = i.id AND pc.status <> 'cancelled' AND pc.reversal_of IS NULL
         ORDER BY pc.created_at DESC LIMIT 1
      ) c ON true
     WHERE i.ref_code IS NOT NULL
     ORDER BY i.created_at DESC
     LIMIT 200
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_comm FROM (
    SELECT c.id, c.created_at, c.source, c.base_amount, c.rate, c.amount, c.status, c.note,
           c.payable_at, c.paid_at, c.payout_id, c.reversal_of, c.inquiry_id,
           EXISTS (SELECT 1 FROM public.partner_commissions rv WHERE rv.reversal_of = c.id) AS reversed,
           p.code, p.name AS partner_name,
           o.order_no, o.plan, i.name AS inquiry_name
      FROM public.partner_commissions c
      JOIN public.partners p ON p.id = c.partner_id
      LEFT JOIN public.partner_commissions orig ON orig.id = c.reversal_of
      LEFT JOIN public.reels_orders o ON o.id = coalesce(c.reels_order_id, orig.reels_order_id)
      LEFT JOIN public.inquiries i ON i.id = c.inquiry_id
     ORDER BY c.created_at DESC
     LIMIT 300
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.month DESC, x.partner_name), '[]'::jsonb) INTO v_pay FROM (
    SELECT y.id, y.month, y.gross, y.income_tax, y.local_tax, y.withholding, y.net, y.status, y.created_at, y.paid_at,
           p.code, p.name AS partner_name,
           y.pay_bank_name AS bank_name, y.pay_bank_account AS bank_account, y.pay_bank_holder AS bank_holder,
           (y.pay_bank_name <> p.bank_name OR y.pay_bank_account <> p.bank_account
             OR y.pay_bank_holder <> p.bank_holder) AS account_changed,
           (SELECT count(*) FROM public.partner_commissions c WHERE c.payout_id = y.id) AS items
      FROM public.partner_payouts y
      JOIN public.partners p ON p.id = y.partner_id
     ORDER BY y.month DESC
     LIMIT 200
  ) x;

  RETURN jsonb_build_object('partners', v_partners, 'inquiries', v_inq, 'commissions', v_comm, 'payouts', v_pay);
END;
$$;

-- ───────── B2) 계정 만들기·연결 ─────────
-- 계정 만들기 화면(/partner/signup?k=…)이 보여 줄 것. 승인·일시정지만(신청 중·거절은 not_found).
CREATE FUNCTION public.partner_account_target(_view_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
BEGIN
  IF _view_key IS NULL OR _view_key !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO p FROM public.partners WHERE view_key = _view_key AND status IN ('approved', 'paused');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', p.id, 'name', p.name, 'email', lower(p.email), 'status', p.status,
                            'has_account', p.user_id IS NOT NULL);
END;
$$;

-- view_key(본인 확인) + 계정 이메일이 신청 이메일과 같을 때만 연결. 한 파트너에 계정 하나, 한 계정에 파트너 하나.
CREATE FUNCTION public.partner_link_user(_view_key text, _user_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
BEGIN
  IF _view_key IS NULL OR _view_key !~ '^[0-9a-f]{64}$' OR _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO p FROM public.partners WHERE view_key = _view_key AND status IN ('approved', 'paused') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF p.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_linked');
  END IF;
  IF lower(btrim(coalesce(_email, ''))) <> lower(p.email) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  END IF;
  IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_taken');
  END IF;
  BEGIN
    UPDATE public.partners SET user_id = _user_id, updated_at = now() WHERE id = p.id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_taken');
  END;
  RETURN jsonb_build_object('ok', true, 'id', p.id);
END;
$$;

-- 로그인한 사람이 파트너인가(연결됨 + 승인·일시정지)
CREATE FUNCTION public.partner_session(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('partner', false); END IF;
  SELECT * INTO p FROM public.partners WHERE user_id = _user_id AND status IN ('approved', 'paused');
  IF NOT FOUND THEN RETURN jsonb_build_object('partner', false); END IF;
  RETURN jsonb_build_object('partner', true, 'id', p.id, 'code', p.code, 'name', p.name, 'status', p.status);
END;
$$;

-- ───────── B3) 대시보드 ─────────
-- _period: '7d' | '30d' | 'month'(한국 시간 이번 달 1일부터). 기간은 방문·상담·결제 수에만, 수수료 합계·목록·정산은 전체.
-- 🚨 계좌는 은행·끝 4자리·예금주만. 손님 이름·연락처는 내보내지 않는다.
CREATE FUNCTION public.partner_dashboard(_user_id uuid, _period text DEFAULT '30d', _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
  v_period text := CASE WHEN _period IN ('7d', '30d', 'month') THEN _period ELSE '30d' END;
  v_since timestamptz;
  v_digits text;
  v_comm jsonb;
  v_months jsonb;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.partners WHERE user_id = _user_id AND status IN ('approved', 'paused');
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public.partner_refresh_payable(_now);

  v_since := CASE v_period
    WHEN '7d' THEN _now - interval '7 days'
    WHEN 'month' THEN (date_trunc('month', (_now AT TIME ZONE 'UTC') + interval '9 hours') - interval '9 hours') AT TIME ZONE 'UTC'
    ELSE _now - interval '30 days' END;
  v_digits := regexp_replace(p.bank_account, '[^0-9]', '', 'g');

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_comm FROM (
    SELECT c.created_at, c.source, c.base_amount, c.amount, c.status, c.payable_at, c.paid_at,
           CASE WHEN c.source = 'reels' THEN o.plan END AS plan,
           (c.reversal_of IS NOT NULL) AS is_reversal
      FROM public.partner_commissions c
      LEFT JOIN public.partner_commissions orig ON orig.id = c.reversal_of
      LEFT JOIN public.reels_orders o ON o.id = coalesce(c.reels_order_id, orig.reels_order_id)
     WHERE c.partner_id = p.id
     ORDER BY c.created_at DESC
     LIMIT 100
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.month DESC), '[]'::jsonb) INTO v_months FROM (
    SELECT y.month, y.gross, y.income_tax, y.local_tax, y.withholding, y.net, y.status, y.paid_at
      FROM public.partner_payouts y WHERE y.partner_id = p.id
     ORDER BY y.month DESC LIMIT 36
  ) x;

  RETURN jsonb_build_object(
    'name', p.name, 'code', p.code, 'status', p.status,
    'phone', p.phone, 'email', p.email, 'channels', p.channels,
    'bank_name', p.bank_name, 'bank_last4', right(v_digits, 4), 'bank_holder', p.bank_holder,
    'account_changed_at', (SELECT max(changed_at) FROM public.partner_account_changes WHERE partner_id = p.id),
    'period', v_period, 'since', v_since,
    'visits', (SELECT count(DISTINCT v.visitor_id) FROM public.site_visits v
                WHERE v.ref_code = p.code AND v.created_at >= v_since AND v.created_at <= _now),
    'inquiries', (SELECT count(*) FROM public.inquiries i
                   WHERE i.ref_code = p.code AND i.created_at >= v_since AND i.created_at <= _now),
    'paid_count', (SELECT count(*) FROM public.partner_commissions c
                    WHERE c.partner_id = p.id AND c.status <> 'cancelled' AND c.reversal_of IS NULL
                      AND c.created_at >= v_since AND c.created_at <= _now),
    'sum_pending', (SELECT coalesce(sum(amount), 0) FROM public.partner_commissions
                     WHERE partner_id = p.id AND status = 'pending'),
    'sum_payable', (SELECT coalesce(sum(amount), 0) FROM public.partner_commissions
                     WHERE partner_id = p.id AND status = 'payable'),
    'sum_paid', (SELECT coalesce(sum(amount), 0) FROM public.partner_commissions
                  WHERE partner_id = p.id AND status = 'paid'),
    'sum_reversed', (SELECT coalesce(sum(amount), 0) FROM public.partner_commissions
                      WHERE partner_id = p.id AND reversal_of IS NOT NULL),
    'commissions', v_comm,
    'months', v_months);
END;
$$;

-- 내 정보 수정: 휴대폰·활동 채널만(이름·이메일은 대표님께 문의)
CREATE FUNCTION public.partner_update_profile(_user_id uuid, _phone text, _channels text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
  v_phone text := regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g');
  v_channels text := btrim(coalesce(_channels, ''));
BEGIN
  SELECT * INTO p FROM public.partners WHERE user_id = _user_id AND status IN ('approved', 'paused') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_phone !~ '^01[016789][0-9]{7,8}$' OR char_length(v_channels) NOT BETWEEN 1 AND 1000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.partners WHERE phone = v_phone AND id <> p.id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_taken');
  END IF;
  BEGIN
    UPDATE public.partners SET phone = v_phone, channels = v_channels, updated_at = now() WHERE id = p.id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_taken');
  END;
  RETURN jsonb_build_object('ok', true, 'phone', v_phone, 'channels', v_channels);
END;
$$;

-- 정산 계좌 변경(서버가 비밀번호를 다시 확인한 뒤 부른다) + 이력. 이미 만든 정산은 스냅샷이라 그대로다.
CREATE FUNCTION public.partner_change_account(
  _user_id uuid, _bank_name text, _bank_account text, _bank_holder text,
  _user_agent text DEFAULT NULL, _now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
  v_bank text := btrim(coalesce(_bank_name, ''));
  v_account text := regexp_replace(btrim(coalesce(_bank_account, '')), '[[:space:]]', '', 'g');
  v_holder text := btrim(coalesce(_bank_holder, ''));
  v_old4 text;
  v_new4 text;
BEGIN
  SELECT * INTO p FROM public.partners WHERE user_id = _user_id AND status IN ('approved', 'paused') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF char_length(v_bank) NOT BETWEEN 1 AND 30 OR v_account !~ '^[0-9-]{6,30}$'
     OR char_length(v_holder) NOT BETWEEN 1 AND 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_bank = p.bank_name AND regexp_replace(v_account, '[^0-9]', '', 'g') = regexp_replace(p.bank_account, '[^0-9]', '', 'g')
     AND v_holder = p.bank_holder THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'same');
  END IF;
  v_old4 := right(regexp_replace(p.bank_account, '[^0-9]', '', 'g'), 4);
  v_new4 := right(regexp_replace(v_account, '[^0-9]', '', 'g'), 4);
  UPDATE public.partners SET bank_name = v_bank, bank_account = v_account, bank_holder = v_holder, updated_at = now()
   WHERE id = p.id;
  INSERT INTO public.partner_account_changes (partner_id, changed_at, old_bank_name, new_bank_name, old_last4, new_last4, user_agent)
  VALUES (p.id, _now, p.bank_name, v_bank, v_old4, v_new4, nullif(left(btrim(coalesce(_user_agent, '')), 120), ''));
  RETURN jsonb_build_object('ok', true, 'name', p.name, 'bank_name', v_bank, 'old_last4', v_old4, 'new_last4', v_new4,
                            'changed_at', _now);
END;
$$;

-- ───────── B4) 계정 만들기 안내 메일 대상·결과 ─────────
-- 이미 승인된 파트너에게도 보낼 수 있다(승인·일시정지, 아직 계정 연결 전).
CREATE FUNCTION public.partner_account_mail_target(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.partners WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF p.status NOT IN ('approved', 'paused') OR p.view_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_approved');
  END IF;
  IF p.user_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'has_account'); END IF;
  RETURN jsonb_build_object('ok', true, 'name', p.name, 'email', p.email, 'code', p.code, 'view_key', p.view_key);
END;
$$;

CREATE FUNCTION public.partner_account_mail_result(_id uuid, _error text DEFAULT NULL, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_err text := nullif(left(btrim(coalesce(_error, '')), 500), '');
BEGIN
  UPDATE public.partners
     SET account_mail_sent_at = CASE WHEN v_err IS NULL THEN _now ELSE account_mail_sent_at END,
         account_mail_error = v_err,
         updated_at = now()
   WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ───────── 실행 권한 ─────────
REVOKE EXECUTE ON FUNCTION public.partner_auto_payouts(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_auto_payouts_notified(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_transfer_list(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_paid_list(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.partner_auto_payouts(timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_auto_payouts_notified(text, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_transfer_list(text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_paid_list(timestamptz, timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.partner_account_target(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_link_user(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_dashboard(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_update_profile(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_change_account(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_account_mail_target(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_account_mail_result(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.partner_account_target(text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_link_user(text, uuid, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_session(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_dashboard(uuid, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_update_profile(uuid, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_change_account(uuid, text, text, text, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_account_mail_target(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_account_mail_result(uuid, text, timestamptz) TO service_role;
-- CREATE OR REPLACE 는 기존 권한을 그대로 둔다(partner_make_payouts·partner_admin_overview 는 20261107160000 에서 이미 막아 둠).
