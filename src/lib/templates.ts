/**
 * 기본 템플릿 5종 + 사용자 양식 불러오기. (기획서 09)
 * 템플릿·색·서체 변경은 문서 표현만 바꾼다. 매칭률과 무관하다.
 */
import type { ResumeSectionKind, TemplateId, TemplateMeta } from "./types";

export const TEMPLATES: TemplateMeta[] = [
  {
    id: "ats-classic",
    name: "ATS Classic",
    koName: "기본형",
    fitFor: "일반 경력직·신입",
    emphasis: "간결한 요약, 경력, 역량, 프로젝트, 학력",
    sectionOrder: ["summary", "experience", "skills", "projects", "education", "certifications"],
    docType: "resume",
    accent: "#2b6cb0",
  },
  {
    id: "executive-impact",
    name: "Executive Impact",
    koName: "성과·리더형",
    fitFor: "시니어·관리자·사업 리더",
    emphasis: "핵심 사업 성과, 리더십, 조직·사업 책임",
    sectionOrder: ["summary", "experience", "skills", "activities", "education"],
    docType: "resume",
    accent: "#17497f",
  },
  {
    id: "technical-evidence",
    name: "Technical Evidence",
    koName: "기술·프로젝트형",
    fitFor: "개발자·기술 직무",
    emphasis: "실제 구현, 문제 해결, 기여와 프로젝트 결과",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications"],
    docType: "resume",
    accent: "#1b8a63",
  },
  {
    id: "career-transition",
    name: "Career Transition",
    koName: "경력 전환형",
    fitFor: "산업·직무 전환자",
    emphasis: "관련 역량과 프로젝트를 먼저, 실제 경력은 정확한 연대기로",
    sectionOrder: ["summary", "skills", "projects", "experience", "education", "certifications"],
    docType: "resume",
    accent: "#b07514",
  },
  {
    id: "academic-cv",
    name: "Academic CV",
    koName: "연구·학술형",
    fitFor: "연구·교육 포지션",
    emphasis: "학위, 연구분야, 논문 상태, 연구·교육·학술 활동",
    sectionOrder: [
      "summary",
      "education",
      "research",
      "publications",
      "experience",
      "teaching",
      "activities",
    ],
    docType: "cv",
    accent: "#5b3fa8",
  },
];

export const TEMPLATE_BY_ID: Record<TemplateId, TemplateMeta> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
) as Record<TemplateId, TemplateMeta>;

export function getTemplate(id: TemplateId): TemplateMeta {
  return TEMPLATE_BY_ID[id] ?? TEMPLATES[0];
}

/** 사용자 양식을 올렸을 때, 그대로 재현할 수 없는 요소를 알려준다. (기획서 09) */
export const CUSTOM_TEMPLATE_UNSUPPORTED_HINTS: Record<string, string> = {
  "pdf": "PDF 양식은 디자인 참고 대상입니다. 항목 위치만 참고하고 기본 템플릿으로 적용합니다.",
  "image": "이미지 양식은 디자인 참고 대상입니다. 글꼴·간격을 그대로 재현할 수 없습니다.",
  "docx": "Word 양식은 항목 위치를 확인한 뒤 적용합니다.",
};

/** 섹션이 그 문서 유형에 쓰이는지 */
export function sectionAppliesTo(kind: ResumeSectionKind, docType: "resume" | "cv"): boolean {
  if (docType === "resume") return !["research", "publications", "teaching"].includes(kind);
  return true;
}
