-- 관리자 「파트너」 탭 목록(표) — 11/7 대표님 요청 「파트너 정보를 관리자 대시보드에서 한눈에 보기 쉽게 목록으로」
-- (20261107180000_partners_dashboard.sql 다음에 적용)
--
-- 새 표·열 없음. 함수만 더한다(모두 service_role 전용, jsonb 반환).
--   partner_admin_list(_period, _now)  → {period, since, month_start, totals, partners:[...]}
--      _period: '7d' | '30d' | 'month'(한국 시간 이번 달 1일부터) | 'all'. 틀린 값은 '30d'.
--      기간은 방문(고유 방문자)·상담 접수·결제 건수·결제 금액에만. 수수료 대기·지급 가능·지급 완료·차감은 누적.
--      파트너 수백 명이어도 한 번에(파트너마다 하위 질의를 돌리지 않고 GROUP BY 로 모아 계산).
--      🚨 계좌는 은행·끝 4자리·예금주만. 전체 번호는 partner_admin_bank 로만.
--      totals: {partners, by_status:{applied,approved,paused,rejected}, month_paid_amount, payable_total, paid_total}
--   partner_admin_summary(_now)        → {approved, applied, paused, payable_total}   관리자 첫 화면 바로가기 카드용(가벼움)
--   partner_admin_detail(_id)          → {ok:true, changes:[...], commissions:[...], payouts:[...]} | {ok:false, reason:'not_found'}
--      계좌 변경 이력(끝 4자리만)·최근 수수료 30줄·최근 정산 24줄
--   partner_admin_bank(_id)            → {ok:true, bank_name, bank_account, bank_holder} | {ok:false, reason:'not_found'}
--      관리자 「전체 보기」 단추만 부른다(서버가 관리자 확인 뒤, 응답 no-store, 로그에 내용 안 찍음).
--   partner_set_memo(_id, _memo, _now) → {ok:true, memo} | {ok:false, reason:'not_found'}   (빈 문자열이면 NULL, 2000자까지)
--
-- 시험: supabase/tests/partners_admin_list.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── 1) 목록 ─────────
CREATE FUNCTION public.partner_admin_list(_period text DEFAULT '30d', _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := CASE WHEN _period IN ('7d', '30d', 'month', 'all') THEN _period ELSE '30d' END;
  v_month_start timestamptz :=
    (date_trunc('month', (_now AT TIME ZONE 'UTC') + interval '9 hours') - interval '9 hours') AT TIME ZONE 'UTC';
  v_since timestamptz;
  v_rows jsonb;
  v_totals jsonb;
BEGIN
  PERFORM public.partner_refresh_payable(_now);

  v_since := CASE v_period
    WHEN '7d' THEN _now - interval '7 days'
    WHEN '30d' THEN _now - interval '30 days'
    WHEN 'month' THEN v_month_start
    ELSE NULL END;  -- 'all' = 처음부터

  WITH vis AS (
    SELECT v.ref_code,
           count(DISTINCT v.visitor_id) FILTER (WHERE (v_since IS NULL OR v.created_at >= v_since) AND v.created_at <= _now) AS visits,
           max(v.created_at) FILTER (WHERE v.created_at <= _now) AS last_visit
      FROM public.site_visits v
     WHERE v.ref_code IS NOT NULL
     GROUP BY v.ref_code
  ), inq AS (
    SELECT i.ref_code,
           count(*) FILTER (WHERE (v_since IS NULL OR i.created_at >= v_since) AND i.created_at <= _now) AS inquiries
      FROM public.inquiries i
     WHERE i.ref_code IS NOT NULL
     GROUP BY i.ref_code
  ), com AS (
    SELECT c.partner_id,
           count(*) FILTER (WHERE c.status <> 'cancelled' AND c.reversal_of IS NULL
                              AND (v_since IS NULL OR c.created_at >= v_since) AND c.created_at <= _now) AS paid_count,
           coalesce(sum(c.base_amount) FILTER (WHERE c.status <> 'cancelled' AND c.reversal_of IS NULL
                              AND (v_since IS NULL OR c.created_at >= v_since) AND c.created_at <= _now), 0) AS paid_amount,
           coalesce(sum(c.amount) FILTER (WHERE c.status <> 'cancelled'
                              AND c.created_at >= v_month_start AND c.created_at <= _now), 0) AS month_commission,
           coalesce(sum(c.amount) FILTER (WHERE c.status = 'pending'), 0) AS sum_pending,
           coalesce(sum(c.amount) FILTER (WHERE c.status = 'payable'), 0) AS sum_payable,
           coalesce(sum(c.amount) FILTER (WHERE c.status = 'paid'), 0) AS sum_paid,
           coalesce(sum(c.amount) FILTER (WHERE c.reversal_of IS NOT NULL), 0) AS sum_reversed,
           max(c.created_at) FILTER (WHERE c.status <> 'cancelled' AND c.reversal_of IS NULL) AS last_paid
      FROM public.partner_commissions c
     GROUP BY c.partner_id
  ), chg AS (
    SELECT ac.partner_id, max(ac.changed_at) AS changed_at
      FROM public.partner_account_changes ac
     GROUP BY ac.partner_id
  ), lst AS (
    SELECT p.id, p.code, p.status, p.name, p.phone, p.email, p.channels, p.memo,
           p.created_at, p.approved_at, p.view_key,
           p.approval_mail_sent_at, p.approval_mail_error,
           (p.user_id IS NOT NULL) AS user_linked, p.account_mail_sent_at, p.account_mail_error,
           p.bank_name, right(regexp_replace(p.bank_account, '[^0-9]', '', 'g'), 4) AS bank_last4, p.bank_holder,
           chg.changed_at AS account_changed_at,
           coalesce(vis.visits, 0)::integer AS visits,
           coalesce(inq.inquiries, 0)::integer AS inquiries,
           coalesce(com.paid_count, 0)::integer AS paid_count,
           coalesce(com.paid_amount, 0)::bigint AS paid_amount,
           coalesce(com.month_commission, 0)::bigint AS month_commission,
           coalesce(com.sum_pending, 0)::bigint AS sum_pending,
           coalesce(com.sum_payable, 0)::bigint AS sum_payable,
           coalesce(com.sum_paid, 0)::bigint AS sum_paid,
           coalesce(com.sum_reversed, 0)::bigint AS sum_reversed,
           vis.last_visit, com.last_paid,
           CASE WHEN vis.last_visit IS NULL THEN com.last_paid
                WHEN com.last_paid IS NULL THEN vis.last_visit
                ELSE greatest(vis.last_visit, com.last_paid) END AS last_activity_at
      FROM public.partners p
      LEFT JOIN vis ON vis.ref_code = p.code
      LEFT JOIN inq ON inq.ref_code = p.code
      LEFT JOIN com ON com.partner_id = p.id
      LEFT JOIN chg ON chg.partner_id = p.id
  )
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.sum_payable DESC, r.created_at DESC), '[]'::jsonb)
    INTO v_rows FROM lst r;

  SELECT jsonb_build_object(
           'partners', (SELECT count(*) FROM public.partners),
           'by_status', jsonb_build_object(
              'applied', (SELECT count(*) FROM public.partners WHERE status = 'applied'),
              'approved', (SELECT count(*) FROM public.partners WHERE status = 'approved'),
              'paused', (SELECT count(*) FROM public.partners WHERE status = 'paused'),
              'rejected', (SELECT count(*) FROM public.partners WHERE status = 'rejected')),
           'month_paid_amount', coalesce(sum(c.base_amount) FILTER (WHERE c.status <> 'cancelled' AND c.reversal_of IS NULL
                                   AND c.created_at >= v_month_start AND c.created_at <= _now), 0),
           'payable_total', coalesce(sum(c.amount) FILTER (WHERE c.status = 'payable'), 0),
           'paid_total', coalesce(sum(c.amount) FILTER (WHERE c.status = 'paid'), 0))
    INTO v_totals
    FROM public.partner_commissions c;

  RETURN jsonb_build_object('period', v_period, 'since', v_since, 'month_start', v_month_start,
                            'totals', v_totals, 'partners', v_rows);
END;
$$;

-- ───────── 2) 첫 화면 요약 ─────────
CREATE FUNCTION public.partner_admin_summary(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.partner_refresh_payable(_now);
  RETURN jsonb_build_object(
    'approved', (SELECT count(*) FROM public.partners WHERE status = 'approved'),
    'applied', (SELECT count(*) FROM public.partners WHERE status = 'applied'),
    'paused', (SELECT count(*) FROM public.partners WHERE status = 'paused'),
    'payable_total', (SELECT coalesce(sum(amount), 0) FROM public.partner_commissions WHERE status = 'payable'));
END;
$$;

-- ───────── 3) 상세(행을 눌렀을 때) ─────────
CREATE FUNCTION public.partner_admin_detail(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb;
  v_comm jsonb;
  v_pay jsonb;
BEGIN
  IF _id IS NULL OR NOT EXISTS (SELECT 1 FROM public.partners WHERE id = _id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x.changed_at DESC), '[]'::jsonb) INTO v_changes FROM (
    SELECT ac.changed_at, ac.old_bank_name, ac.new_bank_name, ac.old_last4, ac.new_last4
      FROM public.partner_account_changes ac
     WHERE ac.partner_id = _id
     ORDER BY ac.changed_at DESC LIMIT 20
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_comm FROM (
    SELECT c.id, c.created_at, c.source, c.base_amount, c.amount, c.status, c.note,
           (c.reversal_of IS NOT NULL) AS is_reversal,
           o.order_no, o.plan, i.name AS inquiry_name
      FROM public.partner_commissions c
      LEFT JOIN public.partner_commissions orig ON orig.id = c.reversal_of
      LEFT JOIN public.reels_orders o ON o.id = coalesce(c.reels_order_id, orig.reels_order_id)
      LEFT JOIN public.inquiries i ON i.id = c.inquiry_id
     WHERE c.partner_id = _id
     ORDER BY c.created_at DESC LIMIT 30
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.month DESC), '[]'::jsonb) INTO v_pay FROM (
    SELECT y.id, y.month, y.gross, y.withholding, y.net, y.status, y.paid_at
      FROM public.partner_payouts y
     WHERE y.partner_id = _id
     ORDER BY y.month DESC LIMIT 24
  ) x;

  RETURN jsonb_build_object('ok', true, 'changes', v_changes, 'commissions', v_comm, 'payouts', v_pay);
END;
$$;

-- ───────── 4) 계좌 전체 보기 ─────────
CREATE FUNCTION public.partner_admin_bank(_id uuid)
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
  RETURN jsonb_build_object('ok', true, 'bank_name', p.bank_name, 'bank_account', p.bank_account, 'bank_holder', p.bank_holder);
END;
$$;

-- ───────── 5) 관리자 메모 ─────────
CREATE FUNCTION public.partner_set_memo(_id uuid, _memo text, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_memo text := nullif(btrim(coalesce(_memo, '')), '');
BEGIN
  IF v_memo IS NOT NULL THEN v_memo := left(v_memo, 2000); END IF;
  UPDATE public.partners SET memo = v_memo, updated_at = _now WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'memo', v_memo);
END;
$$;

-- ───────── 6) 실행 권한(service_role 만) ─────────
REVOKE EXECUTE ON FUNCTION public.partner_admin_list(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_admin_summary(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_admin_detail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_admin_bank(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_set_memo(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.partner_admin_list(text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_admin_summary(timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_admin_detail(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_admin_bank(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_set_memo(uuid, text, timestamptz) TO service_role;
