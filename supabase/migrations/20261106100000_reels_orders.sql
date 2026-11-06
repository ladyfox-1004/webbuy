-- 「문의 댓글 릴스」 판매 + 페이앱 단건 결제 (설계서 docs/superpowers/specs/2026-11-06-reference-reel-ad-landing-design.md,
-- 작업 계약서 「DB」 절). 참고 구현: 빌드넷 20261025100000_payapp_subscription.sql · 20261028200000_payapp_refund_harden.sql
--
-- 구성
--   설정: reels_settings(행 1개) — 개시 스위치 enabled(기본 꺼짐)·동의 문구 버전
--   표:   reels_order_counters(한국 날짜별 주문 순번)
--         reels_orders(주문, id = 페이앱 var1, 주문번호 R+YYMMDD+-+순번, 주문 화면 열쇠는 sha256 hex 만)
--         reels_payapp_events(받은 통보 원본 — linkkey·linkval·hash 지우고 recvphone 끝 4자리)
--         reels_uploads(주문별 자료: 파일·홈페이지·참고 릴스 주소·요청사항)
--   버킷: reels-uploads(비공개, 한 파일 500MB, 사진·영상만). 정책 없음 = service_role 서명 주소로만 오간다
--   예약: cron reels-expire-stale 매시 17분 — 24시간 넘은 결제 대기 주문 만료
--   쓰기: 표 5개 모두 RLS 켬·정책 없음·anon/authenticated 권한 회수. 엣지 함수(service_role)만 아래 RPC·표를 쓴다.
--
-- 엣지 함수 계약(service_role 전용, 모두 jsonb 반환, admin.rpc(name, {...}))
--   reels_shop_history(_insta, _phone)                → [{id, order_no, plan, is_trial, status, amount, paid_at, created_at, credit_trial_order_id, insta_id, phone}]
--   reels_create_order(_o jsonb)                      → {ok:true, order_id, order_no, amount, expired_ids} | {ok:false, reason:'disabled'|'stale_quote'}
--   reels_mark_requested(_order_id, _mul_no, _payurl, _error) → {ok:true}
--   reels_record_event(_payload, _source, _verified, _verify_error) → bigint(통보 id)
--   reels_apply_event(_event_id)                      → {result:'applied'|'duplicate'|'needs_review'|'ignored'|'error', detail, order_id, send_mail}
--   reels_mail_claim(_order_id, _new_key_hash)        → {order_no, email, shop_name, plan, amount, list_price, discount, is_trial, method, paid_at} | null
--   reels_mail_done(_order_id, _status)               → {ok:true}
--   reels_order_view(_order_no, _key_hash)            → {id, order_no, plan, ..., uploads:[...]} | null (전화·이메일·확인 필요 표시 없음)
--   reels_add_upload(_order_id, _kind, _storage_path, _file_name, _mime, _size, _url, _note) → {ok:true, id} | {ok:false, reason}
--   reels_expire_stale()                              → {expired_orders}
--
-- 동시성: 주문 만들기·통보 적용은 가게 advisory 잠금('reels_insta:'||아이디, 'reels_phone:'||번호, 문자열 정렬 순서)을
--         먼저 잡고 그다음 주문 행 FOR UPDATE. 같은 순서라 서로 엇갈려 막히지 않는다.
-- 시각: 한국 날짜는 now() AT TIME ZONE 'Asia/Seoul'.
-- 시험: supabase/tests/reels_orders.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── 1) 표 ─────────
CREATE TABLE public.reels_settings (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled          boolean NOT NULL DEFAULT false,
  consent_version  text NOT NULL DEFAULT 'reels-2026-11-06',
  updated_at       timestamptz,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.reels_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.reels_order_counters (
  day      date PRIMARY KEY,                -- 한국 날짜
  last_no  integer NOT NULL CHECK (last_no >= 0)
);

CREATE TABLE public.reels_orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- 페이앱 var1
  order_no               text NOT NULL UNIQUE CHECK (order_no ~ '^R[0-9]{6}-[0-9]{4,}$'),
  plan                   smallint NOT NULL CHECK (plan IN (1, 5, 10)),
  list_price             integer NOT NULL,
  discount               integer NOT NULL DEFAULT 0 CHECK (discount >= 0),
  amount                 integer NOT NULL,
  is_trial               boolean NOT NULL DEFAULT false,
  credit_trial_order_id  uuid REFERENCES public.reels_orders(id) ON DELETE SET NULL,
  shop_name              text NOT NULL CHECK (char_length(shop_name) BETWEEN 1 AND 200),
  insta_id               text NOT NULL CHECK (insta_id ~ '^[a-z0-9._]{1,30}$'),
  phone                  text NOT NULL CHECK (phone ~ '^01[016789][0-9]{7,8}$'),
  email                  text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  method                 text NOT NULL CHECK (method IN ('send_materials', 'ai_only')),
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  needs_check            boolean NOT NULL DEFAULT false,
  check_reason           text,
  check_resolved_at      timestamptz,
  check_note             text,
  mul_no                 text,
  payurl                 text,
  request_error          text,
  paid_at                timestamptz,
  cancelled_at           timestamptz,
  expired_at             timestamptz,
  view_key_hashes        text[] NOT NULL CHECK (
                           cardinality(view_key_hashes) BETWEEN 1 AND 20
                           AND array_position(view_key_hashes, NULL) IS NULL
                           AND array_to_string(view_key_hashes, ',') ~ '^[0-9a-f]{64}(,[0-9a-f]{64})*$'),
  consent_at             timestamptz NOT NULL DEFAULT now(),
  consent_version        text NOT NULL CHECK (consent_version <> ''),
  mail_status            text,
  mail_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reels_orders_amount_check CHECK (amount = list_price - discount AND amount >= 1000)
);
CREATE UNIQUE INDEX reels_orders_mul_no_key ON public.reels_orders (mul_no) WHERE mul_no IS NOT NULL;
CREATE INDEX reels_orders_insta_idx ON public.reels_orders (insta_id);
CREATE INDEX reels_orders_phone_idx ON public.reels_orders (phone);
CREATE INDEX reels_orders_status_idx ON public.reels_orders (status, created_at);
CREATE INDEX reels_orders_credit_idx ON public.reels_orders (credit_trial_order_id) WHERE credit_trial_order_id IS NOT NULL;

CREATE TABLE public.reels_payapp_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at    timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL CHECK (source IN ('feedback', 'fail')),
  mul_no         text,
  pay_state      integer,
  var1           text,
  price          text,                     -- 받은 그대로(예: "99000.0")
  verified       boolean NOT NULL DEFAULT false,
  verify_error   text,
  result         text CHECK (result IS NULL OR result IN ('applied', 'duplicate', 'needs_review', 'ignored', 'error')),
  result_detail  text,
  order_id       uuid REFERENCES public.reels_orders(id) ON DELETE SET NULL,
  payload        jsonb NOT NULL,           -- 원본(linkkey·linkval·hash 지움, recvphone 끝 4자리)
  processed_at   timestamptz
);
CREATE INDEX reels_payapp_events_mul_idx ON public.reels_payapp_events (mul_no);
CREATE INDEX reels_payapp_events_order_idx ON public.reels_payapp_events (order_id);
CREATE INDEX reels_payapp_events_result_idx ON public.reels_payapp_events (result, received_at DESC);

CREATE TABLE public.reels_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.reels_orders(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('file', 'homepage', 'reference', 'note')),
  storage_path  text UNIQUE,
  file_name     text,
  mime          text,
  size_bytes    bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 524288000),
  url           text CHECK (url IS NULL OR char_length(url) <= 2048),
  note          text CHECK (note IS NULL OR char_length(note) <= 4000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'file' OR storage_path IS NOT NULL)
);
CREATE INDEX reels_uploads_order_idx ON public.reels_uploads (order_id, created_at);

-- ───────── 2) RLS·권한 ─────────
ALTER TABLE public.reels_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_payapp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels_uploads ENABLE ROW LEVEL SECURITY;
-- 정책은 일부러 만들지 않는다(화면은 직접 못 읽는다)

REVOKE ALL ON public.reels_settings, public.reels_order_counters, public.reels_orders,
              public.reels_payapp_events, public.reels_uploads
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reels_settings, public.reels_order_counters, public.reels_orders,
             public.reels_payapp_events, public.reels_uploads
  TO service_role;

-- ───────── 3) 비공개 버킷 ─────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reels-uploads', 'reels-uploads', false, 524288000, ARRAY['image/*', 'video/*'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ───────── 4) 내부 도우미(service_role 에도 열지 않음) ─────────
-- 금액 문자열("99000", "99000.0") → 정수. 정수가 아니거나 읽을 수 없으면 NULL
CREATE OR REPLACE FUNCTION public._reels_amount(_s text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric;
BEGIN
  IF _s IS NULL OR btrim(_s) !~ '^[0-9]+(\.[0-9]+)?$' THEN RETURN NULL; END IF;
  v := btrim(_s)::numeric;
  IF v <> trunc(v) OR v > 2147483647 THEN RETURN NULL; END IF;
  RETURN v::integer;
END;
$$;

-- 통보 원본에서 비밀값을 지우고 휴대폰 번호는 끝 4자리만
CREATE OR REPLACE FUNCTION public._reels_sanitize(_p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _p ? 'recvphone' THEN
      (_p - 'linkkey' - 'linkval' - 'hash' - 'recvphone')
      || jsonb_build_object('recvphone', right(regexp_replace(coalesce(_p->>'recvphone', ''), '[^0-9]', '', 'g'), 4))
    ELSE _p - 'linkkey' - 'linkval' - 'hash'
  END;
$$;

-- 정가표(부가세 포함)
CREATE OR REPLACE FUNCTION public._reels_list_price(_plan integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _plan WHEN 1 THEN 200000 WHEN 5 THEN 750000 WHEN 10 THEN 1400000 END;
$$;

-- 가게 잠금: 인스타·전화 두 열쇠를 문자열 정렬 순서로(트랜잭션 끝에 풀림)
CREATE OR REPLACE FUNCTION public._reels_lock_shop(_insta text, _phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  FOR k IN
    SELECT x FROM unnest(ARRAY['reels_insta:' || _insta, 'reels_phone:' || _phone]) AS x
     WHERE x IS NOT NULL
     ORDER BY x COLLATE "C"
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(k, 0));
  END LOOP;
END;
$$;

-- ───────── 5) RPC ─────────
-- 5.1 같은 가게 주문 이력(금액 계산용, 최근 200개)
CREATE OR REPLACE FUNCTION public.reels_shop_history(_insta text, _phone text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', h.id, 'order_no', h.order_no, 'plan', h.plan, 'is_trial', h.is_trial, 'status', h.status,
           'amount', h.amount, 'paid_at', h.paid_at, 'created_at', h.created_at,
           'credit_trial_order_id', h.credit_trial_order_id, 'insta_id', h.insta_id, 'phone', h.phone)
           ORDER BY h.created_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM public.reels_orders
           WHERE insta_id = _insta OR phone = _phone
           ORDER BY created_at DESC
           LIMIT 200) h;
$$;

-- 5.2 주문 만들기(결제 대기). 엣지 함수가 계산한 금액을 잠근 뒤 다시 확인한다.
CREATE OR REPLACE FUNCTION public.reels_create_order(_o jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.reels_settings%ROWTYPE;
  t public.reels_orders%ROWTYPE;
  v_plan integer;
  v_lp integer;
  v_disc integer;
  v_amt integer;
  v_trial boolean;
  v_credit uuid;
  v_shop text;
  v_insta text;
  v_phone text;
  v_email text;
  v_method text;
  v_hash text;
  v_consent text;
  v_stale text;
  v_expired uuid[] := '{}';
  v_day date;
  v_no integer;
  v_order_no text;
  v_id uuid;
BEGIN
  IF _o IS NULL OR jsonb_typeof(_o) <> 'object' THEN
    RAISE EXCEPTION '주문 입력 형식이 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO s FROM public.reels_settings WHERE id;
  IF NOT coalesce(s.enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;

  v_plan    := (_o->>'plan')::integer;
  v_lp      := (_o->>'list_price')::integer;
  v_disc    := (_o->>'discount')::integer;
  v_amt     := (_o->>'amount')::integer;
  v_trial   := coalesce((_o->>'is_trial')::boolean, false);
  v_credit  := nullif(_o->>'credit_trial_order_id', '')::uuid;
  v_shop    := btrim(_o->>'shop_name');
  v_insta   := _o->>'insta_id';
  v_phone   := _o->>'phone';
  v_email   := btrim(_o->>'email');
  v_method  := _o->>'method';
  v_hash    := _o->>'view_key_hash';
  v_consent := btrim(_o->>'consent_version');

  IF v_plan IS NULL OR v_plan NOT IN (1, 5, 10) THEN
    RAISE EXCEPTION 'plan 이 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  IF v_insta IS NULL OR v_insta !~ '^[a-z0-9._]{1,30}$' THEN
    RAISE EXCEPTION '인스타 아이디가 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL OR v_phone !~ '^01[016789][0-9]{7,8}$' THEN
    RAISE EXCEPTION '전화번호가 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  IF v_method IS NULL OR v_method NOT IN ('send_materials', 'ai_only') THEN
    RAISE EXCEPTION '제작 방식이 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  IF v_hash IS NULL OR v_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION '주문 화면 열쇠 해시가 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_shop, '') = '' OR coalesce(v_email, '') = '' OR coalesce(v_consent, '') = '' THEN
    RAISE EXCEPTION '상호·이메일·동의 버전이 필요합니다' USING ERRCODE = '22023';
  END IF;

  -- 같은 가게 동시 주문·결제 통보를 줄 세운다
  PERFORM public._reels_lock_shop(v_insta, v_phone);

  -- 잠근 뒤 다시 확인(어긋나면 엣지 함수가 한 번 다시 계산)
  IF v_lp IS DISTINCT FROM public._reels_list_price(v_plan) THEN
    v_stale := '정가가 다릅니다';
  ELSIF v_disc IS NULL OR v_amt IS DISTINCT FROM v_lp - v_disc THEN
    v_stale := '금액 계산이 맞지 않습니다';
  ELSIF v_trial THEN
    IF v_plan <> 1 OR v_credit IS NOT NULL OR v_disc <> 101000 THEN
      v_stale := '체험 조건(1편·할인 101000원)이 맞지 않습니다';
    -- 한 번이라도 결제된 주문(지금 결제 완료 + 결제 뒤 취소, paid_at 있음)이 있으면 체험 아님(11/6 대표님 결정)
    ELSIF EXISTS (SELECT 1 FROM public.reels_orders
                   WHERE paid_at IS NOT NULL AND (insta_id = v_insta OR phone = v_phone)) THEN
      v_stale := '같은 가게에 결제된 적 있는 주문이 있어 체험이 아닙니다';
    END IF;
  ELSIF v_credit IS NOT NULL THEN
    SELECT * INTO t FROM public.reels_orders WHERE id = v_credit;
    IF v_plan NOT IN (5, 10) OR v_disc <> 99000 THEN
      v_stale := '체험 차감 조건(5·10편·할인 99000원)이 맞지 않습니다';
    ELSIF t.id IS NULL OR NOT t.is_trial OR t.status <> 'paid' OR t.paid_at IS NULL
          OR NOT (t.insta_id = v_insta OR t.phone = v_phone) THEN
      v_stale := '차감할 체험 주문이 같은 가게의 결제 완료 체험이 아닙니다';
    ELSIF now() >= t.paid_at + interval '7 days' THEN
      v_stale := '체험 결제 뒤 7일이 지났습니다';
    ELSIF EXISTS (SELECT 1 FROM public.reels_orders WHERE credit_trial_order_id = v_credit AND status = 'paid') THEN
      v_stale := '이 체험 차감은 이미 썼습니다';
    END IF;
  ELSIF v_disc <> 0 THEN
    v_stale := '할인 근거가 없습니다';
  END IF;
  IF v_stale IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_quote', 'detail', v_stale);
  END IF;

  -- 한 가게당 열린 체험은 하나: 옛 결제 대기 체험을 만료
  IF v_trial THEN
    WITH u AS (
      UPDATE public.reels_orders
         SET status = 'expired', expired_at = now(), updated_at = now()
       WHERE is_trial AND status = 'pending' AND (insta_id = v_insta OR phone = v_phone)
      RETURNING id
    )
    SELECT coalesce(array_agg(id), '{}') INTO v_expired FROM u;
  END IF;

  -- 주문번호: 한국 날짜별 순번
  v_day := (now() AT TIME ZONE 'Asia/Seoul')::date;
  INSERT INTO public.reels_order_counters AS c (day, last_no) VALUES (v_day, 1)
  ON CONFLICT (day) DO UPDATE SET last_no = c.last_no + 1
  RETURNING last_no INTO v_no;
  v_order_no := 'R' || to_char(v_day, 'YYMMDD') || '-'
             || CASE WHEN v_no < 10000 THEN lpad(v_no::text, 4, '0') ELSE v_no::text END;

  INSERT INTO public.reels_orders
    (order_no, plan, list_price, discount, amount, is_trial, credit_trial_order_id,
     shop_name, insta_id, phone, email, method, view_key_hashes, consent_at, consent_version)
  VALUES
    (v_order_no, v_plan, v_lp, v_disc, v_amt, v_trial, v_credit,
     left(v_shop, 200), v_insta, v_phone, left(v_email, 254), v_method, ARRAY[v_hash], now(), left(v_consent, 100))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'order_id', v_id, 'order_no', v_order_no, 'amount', v_amt,
                            'expired_ids', to_jsonb(v_expired));
END;
$$;

-- 5.3 결제창 요청 결과 기록
CREATE OR REPLACE FUNCTION public.reels_mark_requested(_order_id uuid, _mul_no text, _payurl text, _error text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF nullif(btrim(_error), '') IS NOT NULL THEN
    UPDATE public.reels_orders
       SET status = 'expired', request_error = left(_error, 1000), expired_at = now(), updated_at = now()
     WHERE id = _order_id AND status = 'pending';
  ELSE
    UPDATE public.reels_orders
       SET mul_no = coalesce(nullif(left(_mul_no, 100), ''), mul_no), payurl = left(_payurl, 2000), updated_at = now()
     WHERE id = _order_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5.4 통보 원본 기록(비밀값 지움). 검증 실패 통보는 바로 result='error'
CREATE OR REPLACE FUNCTION public.reels_record_event(
  _payload jsonb, _source text, _verified boolean, _verify_error text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p jsonb := coalesce(_payload, '{}'::jsonb);
  v_id bigint;
  v_state integer;
BEGIN
  IF jsonb_typeof(v_p) <> 'object' THEN
    RAISE EXCEPTION '통보 형식이 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  v_p := public._reels_sanitize(v_p);
  v_state := CASE WHEN (v_p->>'pay_state') ~ '^[0-9]{1,4}$' THEN (v_p->>'pay_state')::integer END;
  INSERT INTO public.reels_payapp_events
    (source, mul_no, pay_state, var1, price, verified, verify_error, payload, result, processed_at)
  VALUES (
    CASE WHEN _source = 'fail' THEN 'fail' ELSE 'feedback' END,
    nullif(left(v_p->>'mul_no', 100), ''), v_state,
    nullif(left(v_p->>'var1', 100), ''), nullif(left(v_p->>'price', 50), ''),
    coalesce(_verified, false), left(_verify_error, 500), v_p,
    CASE WHEN coalesce(_verified, false) THEN NULL ELSE 'error' END,
    CASE WHEN coalesce(_verified, false) THEN NULL ELSE now() END)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 5.5 통보 적용. 멱등: 이미 paid 면 duplicate, 이미 cancelled 면 duplicate.
--     결제는 그대로 받고(자동 환불 없음) 이상한 경우 주문에 needs_check 를 붙인다.
CREATE OR REPLACE FUNCTION public.reels_apply_event(_event_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.reels_payapp_events%ROWTYPE;
  o public.reels_orders%ROWTYPE;
  v_oid uuid;
  v_insta text;
  v_phone text;
  v_price integer;
  v_result text;
  v_detail text;
  v_flag text;
  v_other text;
  v_mail boolean := false;
BEGIN
  SELECT * INTO n FROM public.reels_payapp_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '통보를 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;
  IF NOT n.verified THEN
    UPDATE public.reels_payapp_events
       SET result = 'error', result_detail = coalesce(result_detail, '검증을 통과하지 못한 통보'),
           processed_at = coalesce(processed_at, now())
     WHERE id = n.id;
    RETURN jsonb_build_object('result', 'error', 'detail', '검증을 통과하지 못한 통보는 처리하지 않습니다',
                              'order_id', NULL, 'send_mail', false);
  END IF;

  -- 주문 찾기: var1(주문 id) → mul_no
  IF n.var1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id, insta_id, phone INTO v_oid, v_insta, v_phone FROM public.reels_orders WHERE id = n.var1::uuid;
  END IF;
  IF v_oid IS NULL AND n.mul_no IS NOT NULL THEN
    SELECT id, insta_id, phone INTO v_oid, v_insta, v_phone FROM public.reels_orders WHERE mul_no = n.mul_no;
  END IF;

  IF v_oid IS NULL THEN
    v_result := 'ignored'; v_detail := '우리 주문을 찾지 못했습니다';
  ELSE
    -- 주문 만들기와 같은 순서: 가게 잠금 → 주문 행 잠금
    PERFORM public._reels_lock_shop(v_insta, v_phone);
    SELECT * INTO o FROM public.reels_orders WHERE id = v_oid FOR UPDATE;

    IF n.mul_no IS NOT NULL AND o.mul_no IS NOT NULL AND n.mul_no <> o.mul_no THEN
      v_result := 'needs_review';
      v_flag := format('결제번호 다름(통보 %s / 주문 %s)', n.mul_no, o.mul_no);

    ELSIF n.pay_state = 4 THEN
      -- ───── 결제 완료 ─────
      IF o.status = 'paid' THEN
        v_result := 'duplicate'; v_detail := '이미 결제 완료로 처리한 주문입니다';
      ELSIF o.status = 'cancelled' THEN
        v_result := 'needs_review'; v_flag := '취소된 주문에 결제 완료 통보가 왔습니다';
      ELSE
        v_price := public._reels_amount(n.price);
        UPDATE public.reels_orders
           SET status = 'paid', paid_at = now(), mul_no = coalesce(n.mul_no, o.mul_no), updated_at = now()
         WHERE id = o.id;
        IF v_price IS DISTINCT FROM o.amount THEN
          v_result := 'needs_review';
          v_flag := format('금액 불일치: 통보 %s원 / 주문 %s원', coalesce(v_price::text, n.price, '?'), o.amount);
        ELSE
          v_result := 'applied'; v_mail := true; v_detail := '결제 완료';
          IF o.is_trial THEN
            SELECT order_no INTO v_other FROM public.reels_orders
             WHERE id <> o.id AND paid_at IS NOT NULL AND (insta_id = o.insta_id OR phone = o.phone)
             ORDER BY paid_at, order_no LIMIT 1;
            IF v_other IS NOT NULL THEN
              v_flag := format('같은 가게 체험 중복 결제(주문번호 %s)', v_other);
            END IF;
          END IF;
          IF o.credit_trial_order_id IS NOT NULL THEN
            v_other := NULL;
            SELECT order_no INTO v_other FROM public.reels_orders
             WHERE id <> o.id AND status = 'paid' AND credit_trial_order_id = o.credit_trial_order_id
             ORDER BY paid_at, order_no LIMIT 1;
            IF v_other IS NOT NULL THEN
              v_flag := concat_ws(' / ', v_flag, format('체험 차감 중복(주문번호 %s)', v_other));
            ELSIF NOT EXISTS (SELECT 1 FROM public.reels_orders
                               WHERE id = o.credit_trial_order_id AND status = 'paid') THEN
              v_flag := concat_ws(' / ', v_flag, '체험 차감 중복: 차감한 체험 주문이 결제 완료 상태가 아닙니다');
            END IF;
          END IF;
          IF v_flag IS NOT NULL THEN v_detail := '결제 완료, 확인 필요: ' || v_flag; END IF;
        END IF;
      END IF;

    ELSIF n.pay_state IN (8, 32, 9, 64) THEN
      -- ───── 취소 ─────
      IF o.status = 'cancelled' THEN
        v_result := 'duplicate'; v_detail := '이미 취소로 처리한 주문입니다';
      ELSE
        UPDATE public.reels_orders
           SET status = 'cancelled', cancelled_at = now(), updated_at = now()
         WHERE id = o.id;
        v_result := 'applied'; v_detail := format('취소(pay_state %s)', n.pay_state);
      END IF;

    ELSIF n.pay_state IN (70, 71) THEN
      -- ───── 부분 취소: 상태는 그대로, 대표님 확인 ─────
      v_result := 'needs_review';
      v_flag := format('부분 취소 %s원', coalesce(public._reels_amount(n.payload->>'cancelprice')::text,
                                                 n.payload->>'cancelprice', '?'));
    ELSE
      v_result := 'ignored'; v_detail := format('처리하지 않는 결제 상태입니다(pay_state %s)', coalesce(n.pay_state::text, '없음'));
    END IF;

    IF v_flag IS NOT NULL THEN
      UPDATE public.reels_orders
         SET needs_check = true,
             check_reason = left(concat_ws(' / ', CASE WHEN needs_check THEN check_reason END, v_flag), 2000),
             check_resolved_at = NULL,
             updated_at = now()
       WHERE id = o.id;
      v_detail := coalesce(v_detail, v_flag);
    END IF;
  END IF;

  UPDATE public.reels_payapp_events
     SET result = v_result, result_detail = left(v_detail, 1000), order_id = v_oid, processed_at = now()
   WHERE id = n.id;

  RETURN jsonb_build_object('result', v_result, 'detail', v_detail, 'order_id', v_oid, 'send_mail', v_mail);
END;
$$;

-- 5.6 결제 완료 메일 한 번만: 'sending' 으로 잡고 메일용 새 열쇠 해시를 더한다
CREATE OR REPLACE FUNCTION public.reels_mail_claim(_order_id uuid, _new_key_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.reels_orders%ROWTYPE;
BEGIN
  IF _new_key_hash IS NULL OR _new_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION '열쇠 해시가 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  UPDATE public.reels_orders
     SET mail_status = 'sending',
         view_key_hashes = CASE WHEN _new_key_hash = ANY (view_key_hashes) THEN view_key_hashes
                                ELSE array_append(view_key_hashes, _new_key_hash) END,
         updated_at = now()
   WHERE id = _order_id AND status = 'paid' AND mail_status IS NULL
  RETURNING * INTO o;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'order_no', o.order_no, 'email', o.email, 'shop_name', o.shop_name, 'plan', o.plan, 'amount', o.amount,
    'list_price', o.list_price, 'discount', o.discount, 'is_trial', o.is_trial, 'method', o.method, 'paid_at', o.paid_at);
END;
$$;

-- 5.7 메일 결과: 'sent' | 'skipped:…' | 'failed:…'
CREATE OR REPLACE FUNCTION public.reels_mail_done(_order_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status IS NULL OR NOT (_status = 'sent' OR _status LIKE 'skipped:%' OR _status LIKE 'failed:%') THEN
    RAISE EXCEPTION '메일 상태 값이 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  UPDATE public.reels_orders
     SET mail_status = left(_status, 500), mail_at = now(), updated_at = now()
   WHERE id = _order_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5.8 손님 주문 화면: 주문번호 + 열쇠 해시. 전화·이메일·확인 필요 표시는 내보내지 않는다
CREATE OR REPLACE FUNCTION public.reels_order_view(_order_no text, _key_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.reels_orders%ROWTYPE;
BEGIN
  IF _order_no IS NULL OR _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO o FROM public.reels_orders WHERE order_no = _order_no AND _key_hash = ANY (view_key_hashes);
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'plan', o.plan, 'list_price', o.list_price, 'discount', o.discount,
    'amount', o.amount, 'is_trial', o.is_trial, 'status', o.status, 'paid_at', o.paid_at, 'created_at', o.created_at,
    'shop_name', o.shop_name, 'method', o.method,
    'uploads', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', u.id, 'kind', u.kind, 'file_name', u.file_name, 'mime', u.mime, 'size_bytes', u.size_bytes,
               'url', u.url, 'note', u.note, 'created_at', u.created_at) ORDER BY u.created_at, u.id)
        FROM public.reels_uploads u WHERE u.order_id = o.id), '[]'::jsonb));
END;
$$;

-- 5.9 자료 기록(결제 완료 주문만, 주문당 200행까지)
CREATE OR REPLACE FUNCTION public.reels_add_upload(
  _order_id uuid, _kind text, _storage_path text, _file_name text, _mime text, _size bigint, _url text, _note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.reels_orders%ROWTYPE;
  v_id uuid;
BEGIN
  IF _kind IS NULL OR _kind NOT IN ('file', 'homepage', 'reference', 'note') THEN
    RAISE EXCEPTION '자료 종류가 올바르지 않습니다' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM public.reels_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF o.status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_paid');
  END IF;
  IF (SELECT count(*) FROM public.reels_uploads WHERE order_id = o.id) >= 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many');
  END IF;
  INSERT INTO public.reels_uploads (order_id, kind, storage_path, file_name, mime, size_bytes, url, note)
  VALUES (o.id, _kind, nullif(_storage_path, ''), left(_file_name, 255), left(_mime, 255), _size, _url, _note)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- 5.10 24시간 넘은 결제 대기 주문 만료(cron 매시 17분)
CREATE OR REPLACE FUNCTION public.reels_expire_stale()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders integer;
BEGIN
  UPDATE public.reels_orders
     SET status = 'expired', expired_at = now(), updated_at = now()
   WHERE status = 'pending' AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_orders = ROW_COUNT;
  RETURN jsonb_build_object('expired_orders', v_orders);
END;
$$;

-- ───────── 6) 함수 권한 ─────────
-- 내부 도우미: 누구에게도 열지 않는다(SECURITY DEFINER RPC 안에서만 쓴다)
REVOKE EXECUTE ON FUNCTION public._reels_amount(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._reels_sanitize(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._reels_list_price(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._reels_lock_shop(text, text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reels_shop_history(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_create_order(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_mark_requested(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_record_event(jsonb, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_apply_event(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_mail_claim(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_mail_done(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_order_view(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_add_upload(uuid, text, text, text, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_expire_stale() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reels_shop_history(text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_create_order(jsonb) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_mark_requested(uuid, text, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_record_event(jsonb, text, boolean, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_apply_event(bigint) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_mail_claim(uuid, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_mail_done(uuid, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_order_view(text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_add_upload(uuid, text, text, text, text, bigint, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reels_expire_stale() TO service_role;

-- ───────── 7) 예약 작업: 결제 대기 24시간 지난 주문 만료(매시 17분) ─────────
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reels-expire-stale';
  PERFORM cron.schedule('reels-expire-stale', '17 * * * *', 'SELECT public.reels_expire_stale()');
END;
$$;
