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
-- 함수 계약(service_role 전용, jsonb 반환)
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

-- ───────── A4) 관리자 화면: 정산 계좌는 스냅샷 ─────────
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

-- ───────── 실행 권한 ─────────
REVOKE EXECUTE ON FUNCTION public.partner_auto_payouts(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_auto_payouts_notified(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_transfer_list(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_paid_list(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.partner_auto_payouts(timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_auto_payouts_notified(text, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_transfer_list(text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_paid_list(timestamptz, timestamptz) TO service_role;
-- CREATE OR REPLACE 는 기존 권한을 그대로 둔다(partner_make_payouts·partner_admin_overview 는 20261107160000 에서 이미 막아 둠).
