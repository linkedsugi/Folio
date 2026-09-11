/**
 * 브라우저에서 파일 텍스트 뽑기.
 *
 * 서버로 보내지 않고 이 기기 안에서 처리한다.
 * 이력서 파일에는 연락처·전 직장 정보가 들어 있고, 기획서 14 는 지원자 자료를
 * 기본 비공개로 두라고 한다. 업로드하지 않는 것이 그 원칙에 가장 충실하다.
 * 덤으로 서버 없이도 앱이 온전히 동작한다.
 */

export interface ExtractResult {
  ok: boolean;
  text: string;
  /** 사용자에게 보여줄 안내. 실패가 아니어도 있을 수 있다. */
  warnings: string[];
  reason?: string;
}

const MAX_BYTES = 20 * 1024 * 1024;

/** 스캔본 PDF 처럼 글자가 거의 없는 경우를 잡아낸다. */
function looksEmpty(text: string): boolean {
  return text.replace(/\s/g, "").length < 40;
}

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      text: "",
      warnings: [],
      reason: "파일이 20MB를 넘습니다. 필요한 부분만 잘라서 올리거나 내용을 붙여넣어 주세요.",
    };
  }

  const name = file.name.toLowerCase();

  try {
    if (name.endsWith(".docx")) return await fromDocx(file);
    if (name.endsWith(".pdf")) return await fromPdf(file);
    if (name.endsWith(".doc")) {
      return {
        ok: false,
        text: "",
        warnings: [],
        reason:
          "예전 .doc 형식은 읽을 수 없습니다. Word 에서 .docx 로 저장하거나 내용을 붙여넣어 주세요.",
      };
    }
    // txt·md 를 비롯한 나머지는 평문으로 읽는다.
    const text = await file.text();
    if (looksEmpty(text)) {
      return { ok: false, text: "", warnings: [], reason: "파일에서 읽을 내용을 찾지 못했습니다." };
    }
    return { ok: true, text, warnings: [] };
  } catch {
    return {
      ok: false,
      text: "",
      warnings: [],
      reason: "파일을 읽지 못했습니다. 내용을 직접 붙여넣어 주세요.",
    };
  }
}

async function fromDocx(file: File): Promise<ExtractResult> {
  // 무거운 라이브러리는 실제로 파일을 올릴 때만 가져온다. 첫 화면을 느리게 하지 않기 위해서다.
  const mammoth = await import("mammoth/mammoth.browser");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value ?? "";
  if (looksEmpty(text)) {
    return {
      ok: false,
      text: "",
      warnings: [],
      reason: "이 Word 문서에서 글자를 찾지 못했습니다. 표나 이미지로만 되어 있으면 읽을 수 없습니다.",
    };
  }
  const warnings = (result.messages ?? [])
    .filter((m: { type?: string }) => m.type === "warning")
    .slice(0, 2)
    .map(() => "서식 일부는 생략하고 글자만 가져왔습니다.");
  return { ok: true, text, warnings };
}

async function fromPdf(file: File): Promise<ExtractResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : text;

  if (looksEmpty(merged)) {
    return {
      ok: false,
      text: "",
      warnings: [],
      reason:
        "이 PDF에는 글자 정보가 없습니다. 스캔한 문서로 보입니다. 내용을 붙여넣거나 원본 파일을 올려 주세요.",
    };
  }
  return {
    ok: true,
    text: merged,
    // PDF 는 줄바꿈과 열 순서가 어긋나는 일이 잦다. 그대로 믿게 두지 않는다.
    warnings: ["PDF 는 줄바꿈이나 항목 순서가 원본과 다를 수 있습니다. 내용을 확인해 주세요."],
  };
}

/**
 * 채용공고 URL 가져오기.
 *
 * 브라우저는 다른 도메인의 페이지를 직접 읽을 수 없다(CORS).
 * 서버가 있는 배포에서는 /api/fetch-jd 가 대신 가져오고,
 * 정적 배포에서는 그 경로가 없으므로 붙여넣기로 안내한다.
 */
export interface FetchJdResult {
  ok: boolean;
  text?: string;
  postings?: { title: string; body: string }[];
  reason?: string;
}

export async function fetchJobPosting(url: string): Promise<FetchJdResult> {
  try {
    const res = await fetch("/api/fetch-jd", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      return { ok: false, reason: UNAVAILABLE };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      // 정적 배포에서는 404 페이지(HTML)가 돌아온다. 그걸 본문으로 착각하지 않는다.
      return { ok: false, reason: UNAVAILABLE };
    }
    return (await res.json()) as FetchJdResult;
  } catch {
    return { ok: false, reason: UNAVAILABLE };
  }
}

const UNAVAILABLE =
  "이 배포에서는 공고 주소를 대신 열어 볼 수 없습니다. 공고 본문을 복사해 붙여넣거나 파일로 올려 주세요.";
