/**
 * 정적 빌드 준비.
 *
 * Next 의 `output: "export"` 는 route handler 를 내보낼 수 없다.
 * API 경로는 Node 배포에서만 의미가 있으므로, 정적 빌드에서만 잠시 치운다.
 *
 * 지우는 것이 아니라 옮기는 것이고, CI 의 일회용 체크아웃에서만 돈다.
 * 로컬에서 실수로 돌렸다면 `node scripts/prepare-static.mjs --restore` 로 되돌린다.
 */
import { existsSync, renameSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const api = resolve(root, "src/app/api");
const parked = resolve(root, ".api-parked");

const restore = process.argv.includes("--restore");

if (restore) {
  if (existsSync(parked)) {
    mkdirSync(dirname(api), { recursive: true });
    renameSync(parked, api);
    console.log("API 경로를 되돌렸습니다: src/app/api");
  } else {
    console.log("되돌릴 것이 없습니다.");
  }
} else if (existsSync(api)) {
  renameSync(api, parked);
  console.log("정적 빌드를 위해 API 경로를 치웠습니다. 공고 URL 가져오기는 빠집니다.");
} else {
  console.log("API 경로가 없습니다. 그대로 진행합니다.");
}
