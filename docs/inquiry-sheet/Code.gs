/**
 * 홈페이지 문의 → 구글 시트 기록 + 메일 알림 (Google Apps Script)
 *
 * 이 스크립트는 구글 시트에 "붙어 있는"(컨테이너 바인딩) 스크립트로 쓴다.
 * 설정 방법은 같은 폴더의 README.md 를 따라 하면 된다.
 *
 * - 홈페이지 서버가 문의 내용을 JSON 으로 POST 하면, 토큰을 확인한 뒤
 *   "문의" 시트에 한 줄을 추가하고 시트 주인에게 메일을 보낸다.
 * - 원본 데이터는 홈페이지 DB(Supabase inquiries)다. 이 시트는 알림용 사본이다.
 * - 토큰은 코드에 적지 않는다. [프로젝트 설정] → [스크립트 속성]의 TOKEN 에 넣는다.
 */

var SHEET_NAME = "문의";
var HEADERS = [
  "접수 시각",
  "이름/회사",
  "연락처",
  "예산",
  "희망 론칭일",
  "필요 솔루션",
  "문의 주제",
  "내용",
  "참고 링크",
  "첨부 여부",
  "출처",
];

/** JSON 응답을 만든다. */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** 문자열을 안전하게 꺼낸다(없으면 빈 문자열). */
function str_(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * 수식 주입 방지: = + - @ 로 시작하는 글은 앞에 ' 를 붙여 글자로만 보이게 한다.
 * (누군가 문의 내용에 =IMPORTXML(...) 같은 걸 넣어도 실행되지 않는다.)
 */
function safe_(v) {
  var s = str_(v);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

/** "문의" 시트를 가져온다. 없으면 만들고, 비어 있으면 머리글을 쓴다. */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 첨부 여부 칸 글자 */
function attachmentLabel_(body) {
  var fileName = str_(body.fileName);
  if (body.attachmentFailed) return "업로드 실패(" + fileName + ")";
  if (body.hasAttachment) return "있음(" + fileName + ")";
  return "없음";
}

/** 홈페이지 서버가 호출하는 입구 */
function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonOut_({ ok: false, error: "bad_request" });
  }

  // 1) 토큰 확인 — 다르거나, 스크립트 속성에 TOKEN 이 없으면 아무것도 하지 않는다.
  var expected = PropertiesService.getScriptProperties().getProperty("TOKEN");
  if (!expected || !body || body.token !== expected) {
    return jsonOut_({ ok: false, error: "unauthorized" });
  }

  var services = Array.isArray(body.services) ? body.services.join(", ") : str_(body.services);
  var receivedAt = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  var attachment = attachmentLabel_(body);

  // 2) 시트에 한 줄 추가 — 동시에 여러 건이 와도 꼬이지 않게 잠근다.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_();
    sheet.appendRow([
      receivedAt,
      safe_(body.name),
      safe_(body.contact),
      safe_(body.budget),
      safe_(body.launchDate),
      safe_(services),
      safe_(body.topic),
      safe_(body.notes),
      safe_(body.referenceLinks),
      safe_(attachment),
      safe_(body.source),
    ]);
  } finally {
    lock.releaseLock();
  }

  // 3) 메일 알림 — 실패해도 시트 기록은 이미 끝났으므로 ok 로 답한다.
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var lines = [
      "홈페이지로 새 문의가 들어왔습니다.",
      "",
      "접수 시각: " + receivedAt,
      "이름/회사: " + str_(body.name),
      "연락처: " + str_(body.contact),
      "예산: " + str_(body.budget),
      "희망 론칭일: " + str_(body.launchDate),
      "필요 솔루션: " + (services || "선택 안 함"),
    ];
    if (str_(body.topic)) lines.push("문의 주제: " + str_(body.topic));
    lines.push("첨부: " + attachment);
    lines.push("");
    lines.push("[내용]");
    lines.push(str_(body.notes) || "(없음)");
    if (str_(body.referenceLinks)) {
      lines.push("");
      lines.push("[참고 링크]");
      lines.push(str_(body.referenceLinks));
    }
    lines.push("");
    lines.push("시트에서 보기: " + ss.getUrl());

    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: "[홈페이지 문의] " + str_(body.name) + " · " + (services || "솔루션 미선택"),
      body: lines.join("\n"),
    });
  } catch (err) {
    console.error("메일 발송 실패: " + err);
  }

  return jsonOut_({ ok: true });
}

/** 연결 확인용: 웹 앱 URL 을 브라우저로 열면 "ok" 가 보인다. */
function doGet() {
  return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 편집기에서 직접 실행하는 테스트.
 * 처음 한 번 실행하면 시트·메일 권한을 승인하는 창이 뜬다.
 * 실행 후 "문의" 시트에 예시 한 줄이 생기고, 내 메일함에 알림 메일이 오면 성공이다.
 */
function testDoPost() {
  var token = PropertiesService.getScriptProperties().getProperty("TOKEN");
  if (!token) {
    throw new Error("스크립트 속성에 TOKEN 이 없습니다. README 의 3단계를 먼저 해주세요.");
  }
  var sample = {
    token: token,
    receivedAt: new Date().toISOString(),
    name: "테스트 / 예시 회사",
    contact: "010-0000-0000",
    budget: "3,000만 원",
    launchDate: "미정",
    services: ["Web/App 플랫폼 구축", "AI 업무 자동화"],
    topic: "연결 테스트",
    notes: "Apps Script 편집기에서 실행한 테스트 문의입니다. 확인 후 이 줄은 지워도 됩니다.",
    referenceLinks: "",
    hasAttachment: false,
    fileName: "",
    attachmentFailed: false,
    source: "test",
  };
  var res = doPost({ postData: { contents: JSON.stringify(sample) } });
  console.log(res.getContent());
}
