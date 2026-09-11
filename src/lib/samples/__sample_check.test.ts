import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { runPipeline } from "@/lib/engine/pipeline";
import { SAMPLE_SOURCES } from "./sources";

const OUT: unknown[] = [];
describe("sample sources", () => {
  it("runs", () => {
    for (const src of SAMPLE_SOURCES) {
      const r = runPipeline({
        jdText: src.jdText,
        profileText: src.profileText,
        sourceType: "sample",
        docType: src.docType,
        language: src.language,
        templateId: src.templateId,
        targetPages: src.targetPages,
      });
      const must = r.posting.requirements.filter((q) => q.kind === "must" && q.derivation === "stated");
      const mustAll = r.posting.requirements.filter((q) => q.kind === "must");
      const pref = r.posting.requirements.filter((q) => q.kind === "preferred");
      const storyLines = r.resumes.story.sections.flatMap((s) => [
        ...s.lines,
        ...s.entries.flatMap((e) => e.lines),
      ]);
      const w = r.report.dimensions.reduce((a, d) => a + d.weight, 0);
      const d = r.report.overall.display;
      OUT.push(
          {
            id: src.id,
            company: r.posting.company,
            role: r.posting.roleTitle,
            team: r.posting.team,
            mustStated: must.length,
            mustAll: mustAll.length,
            preferred: pref.length,
            responsibilities: r.posting.responsibilities.length,
            experiences: r.profile.experiences.length,
            kinds: r.profile.experiences.map((e) => `${e.kind}:${e.organization}|${e.title}|${e.start}~${e.end}`),
            pubStatus: r.profile.experiences.filter((e) => e.kind === "publication").map((e) => e.publicationStatus),
            name: r.profile.name,
            headline: r.profile.headline,
            email: r.profile.contact.email,
            display: d,
            monotonic: d.current <= d.afterStory && d.afterStory <= d.target,
            weightSum: w,
            dims: r.report.dimensions.map((x) => `${x.label}[${x.kind}] ${x.weight}% ${x.current}/${x.afterStory}/${x.target} ${x.storyLift}`),
            storyLines: storyLines.length,
            baselineLines: r.resumes.baseline.sections.flatMap((s) => [...s.lines, ...s.entries.flatMap((e) => e.lines)]).length,
            futureLines: r.resumes.future.sections.flatMap((s) => [...s.lines, ...s.entries.flatMap((e) => e.lines)]).length,
            plannedLines: r.resumes.future.sections.flatMap((s) => [...s.lines, ...s.entries.flatMap((e) => e.lines)]).filter((l) => l.basis === "planned").length,
            mustHave: r.report.mustHaveStatus.map((m) => `${m.label}=${m.state}`),
            verdict: r.report.verdict,
            stories: r.report.stories.length,
            actions: r.report.actions.length,
            questions: r.questions.length,
            profileFlags: r.profile.reviewFlags.map((f) => f.message),
            postingFlags: r.posting.reviewFlags.map((f) => f.message),
          },
      );
    }
    writeFileSync("/tmp/claude-0/-home-user-Folio/5388a5ab-a457-5874-90ff-200696385c8a/scratchpad/out.json", JSON.stringify(OUT, null, 1));
  });
});
