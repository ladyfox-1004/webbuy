// 릴스 판매·방문 기록·영업 메일 SQL 시험 실행기 — 메모리 Postgres(PGlite)에서 돌린다. 운영 DB 에 연결하지 않는다.
//
// 실행(저장소 루트에서): deno run -A supabase/tests/run-sql-tests.ts
//   같은 폴더 deno.json 의 "nodeModulesDir": "none" 덕분에 저장소 package.json/node_modules 와 섞이지 않고
//   Deno 캐시에서 PGlite 를 받는다(이 파일이 없으면 "Could not find a matching package" 오류).
//
// 순서: ① 아래 SUPABASE_FAKE_SQL(가짜 Supabase 뼈대) → ② 마이그레이션 → ③ 시험 파일(BEGIN … ROLLBACK)
// 시험 파일의 RAISE NOTICE 'PASS …' 를 세고, 오류가 나면 종료 코드 1.
//
// ⚠️ SUPABASE_FAKE_SQL 은 운영 Supabase 와 **다른 가짜**다. 시험에 필요한 만큼만 흉내 낸다.
//   - auth.users 는 id 열만, storage.buckets 는 열 5개만, storage.objects·정책·트리거 없음
//   - cron.job / cron.schedule / cron.unschedule 은 표에 적기만 하는 가짜(실제로 예약 실행하지 않음)
//   - anon·authenticated·service_role 은 NOLOGIN 역할만(JWT·PostgREST 없음). service_role 은 BYPASSRLS
//   - 운영 Supabase 처럼 public 스키마의 새 표·함수에 anon·authenticated·service_role 기본 권한을 준다
//     (그래야 마이그레이션의 REVOKE 가 진짜로 필요한지 시험이 잡아낸다)
//   - 함수 주인은 PGlite 의 슈퍼유저 postgres(운영의 postgres 는 슈퍼유저가 아님)
import { PGlite } from "npm:@electric-sql/pglite@0.5.10";

const SUPABASE_FAKE_SQL = `
-- ===== 가짜 Supabase 뼈대(시험 전용, 운영과 다름) =====
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 운영 Supabase 기본 권한 흉내: 새 표·시퀀스·함수를 세 역할 모두에게 연다
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text UNIQUE,
  schedule text NOT NULL,
  command text NOT NULL
);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
LANGUAGE sql AS $$
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid
$$;
CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean
LANGUAGE sql AS $$ WITH d AS (DELETE FROM cron.job WHERE jobid = job_id RETURNING 1) SELECT EXISTS (SELECT 1 FROM d) $$;
CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean
LANGUAGE sql AS $$ WITH d AS (DELETE FROM cron.job WHERE jobname = job_name RETURNING 1) SELECT EXISTS (SELECT 1 FROM d) $$;
`;

const here = new URL(".", import.meta.url);
const migration = new URL("../migrations/20261106100000_reels_orders.sql", here);
const testFile = new URL("./reels_orders.test.sql", here);
// 방문 기록(20261107100000_site_visits.sql)은 상담 접수 수를 세려고 public.inquiries 를 읽는다 → 그 마이그레이션을 먼저.
const inquiriesMigration = new URL("../migrations/20260907100000_inquiries.sql", here);
const visitsMigration = new URL("../migrations/20261107100000_site_visits.sql", here);
const visitsTestFile = new URL("./site_visits.test.sql", here);
// 영업 메일(20261107120000_outreach.sql)은 site_visits.source 제약을 고친다 → 방문 기록 마이그레이션 다음에.
const outreachMigration = new URL("../migrations/20261107120000_outreach.sql", here);
const outreachTestFile = new URL("./outreach.test.sql", here);
// 영업 메일 자동 발송 스위치(20261107130000_outreach_settings.sql) — 영업 메일 다음에.
const outreachSettingsMigration = new URL("../migrations/20261107130000_outreach_settings.sql", here);
const outreachSettingsTestFile = new URL("./outreach_settings.test.sql", here);
// 영업 메일 후보 풀·쿼터·자동 고르기(20261107140000_outreach_candidates.sql) — 스위치 표에 열을 더하므로 그 다음에.
const outreachCandidatesMigration = new URL("../migrations/20261107140000_outreach_candidates.sql", here);
const outreachCandidatesTestFile = new URL("./outreach_candidates.test.sql", here);
// 카카오 채널 챗봇(20261107150000_kakao_chat.sql) — 대화 상태·챗봇 질문·추가 FAQ. 다른 표에 기대지 않는다.
const kakaoChatMigration = new URL("../migrations/20261107150000_kakao_chat.sql", here);
const kakaoChatTestFile = new URL("./kakao_chat.test.sql", here);
// 추천인(파트너)(20261107160000_partners.sql) — reels_orders·inquiries·site_visits 에 ref_code 열·트리거를 더하므로 맨 뒤에.
const partnersMigration = new URL("../migrations/20261107160000_partners.sql", here);
const partnersTestFile = new URL("./partners.test.sql", here);
// 추천인 후속(20261107170000_partners_followup.sql) — 지급 뒤 환불 차감·승인 메일 기록·미승인 정리. 파트너 다음에.
const partnersFollowupMigration = new URL("../migrations/20261107170000_partners_followup.sql", here);
const partnersFollowupTestFile = new URL("./partners_followup.test.sql", here);
// 파트너 지급 편의·로그인 대시보드(20261107180000_partners_dashboard.sql) — 정산 계좌 스냅샷·자동 정산·계정 연결. 후속 다음에.
//   마이그레이션 직전에 「옛 정산 한 줄」을 넣어 스냅샷 채우기(기존 행 백필)를 확인한다(시험 파일이 지우지 않고 그대로 둔다).
const partnersDashboardMigration = new URL("../migrations/20261107180000_partners_dashboard.sql", here);
const partnersDashboardTestFile = new URL("./partners_dashboard.test.sql", here);
const PARTNERS_DASHBOARD_SEED_SQL = `
INSERT INTO public.partners (code, status, name, phone, email, bank_name, bank_account, bank_holder, approved_at)
VALUES ('seedold', 'approved', '옛정산', '01069990001', 'seedold@example.com', '하나은행', '333-444444-55555', '옛정산', now());
INSERT INTO public.partner_payouts (partner_id, month, gross, income_tax, local_tax, withholding, net, status)
SELECT id, '2026-09', 10000, 300, 30, 330, 9670, 'pending' FROM public.partners WHERE code = 'seedold';
`;

const db = new PGlite();
let passed = 0;
const onNotice = (n: { message?: string }) => {
  const msg = n.message ?? "";
  if (msg.startsWith("PASS")) passed++;
  console.log(`  ${msg}`);
};

async function step(label: string, sql: string) {
  console.log(`▶ ${label}`);
  try {
    await db.exec(sql, { onNotice });
  } catch (e) {
    const err = e as { message?: string; detail?: string; where?: string; hint?: string };
    console.error(`✗ ${label} 실패: ${err.message}`);
    if (err.detail) console.error(`  detail: ${err.detail}`);
    if (err.hint) console.error(`  hint: ${err.hint}`);
    if (err.where) console.error(`  where: ${err.where}`);
    console.error(`통과 ${passed}개 뒤 실패`);
    await db.close();
    Deno.exit(1);
  }
}

await step("가짜 Supabase 뼈대", SUPABASE_FAKE_SQL);
await step("마이그레이션 20261106100000_reels_orders.sql", await Deno.readTextFile(migration));
await step("시험 reels_orders.test.sql", await Deno.readTextFile(testFile));
await step("마이그레이션 20260907100000_inquiries.sql", await Deno.readTextFile(inquiriesMigration));
await step("마이그레이션 20261107100000_site_visits.sql", await Deno.readTextFile(visitsMigration));
await step("시험 site_visits.test.sql", await Deno.readTextFile(visitsTestFile));
await step("마이그레이션 20261107120000_outreach.sql", await Deno.readTextFile(outreachMigration));
await step("시험 outreach.test.sql", await Deno.readTextFile(outreachTestFile));
await step("마이그레이션 20261107130000_outreach_settings.sql", await Deno.readTextFile(outreachSettingsMigration));
await step("시험 outreach_settings.test.sql", await Deno.readTextFile(outreachSettingsTestFile));
await step("마이그레이션 20261107140000_outreach_candidates.sql", await Deno.readTextFile(outreachCandidatesMigration));
await step("시험 outreach_candidates.test.sql", await Deno.readTextFile(outreachCandidatesTestFile));
await step("마이그레이션 20261107150000_kakao_chat.sql", await Deno.readTextFile(kakaoChatMigration));
await step("시험 kakao_chat.test.sql", await Deno.readTextFile(kakaoChatTestFile));
await step("마이그레이션 20261107160000_partners.sql", await Deno.readTextFile(partnersMigration));
await step("시험 partners.test.sql", await Deno.readTextFile(partnersTestFile));
await step("마이그레이션 20261107170000_partners_followup.sql", await Deno.readTextFile(partnersFollowupMigration));
await step("시험 partners_followup.test.sql", await Deno.readTextFile(partnersFollowupTestFile));
await step("시드: 옛 정산 한 줄(스냅샷 채우기 확인용)", PARTNERS_DASHBOARD_SEED_SQL);
await step("마이그레이션 20261107180000_partners_dashboard.sql", await Deno.readTextFile(partnersDashboardMigration));
await step("시험 partners_dashboard.test.sql", await Deno.readTextFile(partnersDashboardTestFile));

console.log(`\n통과 ${passed}개, 실패 0개`);
await db.close();
if (passed === 0) Deno.exit(1);
