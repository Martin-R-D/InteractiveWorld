import test from "node:test";
import assert from "node:assert/strict";
import { parseResponseJson } from "../server/response-json.mjs";

test("response parsing preserves multiline source and existing JSON escapes", () => {
  const code = "\nvar label = \"Hello\";\n\tapi.part('body', {});\r\n";
  const valid = JSON.stringify({ code });
  assert.deepEqual(parseResponseJson(valid), { code });
  const multiline = valid
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");
  assert.deepEqual(parseResponseJson("```json\n" + multiline + "\n```"), {
    code,
  });
  assert.throws(() => parseResponseJson('{"code":"unfinished}'));
  assert.throws(() => parseResponseJson('{"code":"ok",}'));
  assert.throws(() => parseResponseJson("process.exit()"));
});
