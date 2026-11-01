// Preserve source-code whitespace when a response contains literal control
// characters inside a JSON string. All other JSON syntax remains strict.
export function parseResponseJson(text) {
  const source = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  let quoted = false;
  let escaped = false;
  let normalized = "";
  for (const character of source) {
    if (quoted && character.charCodeAt(0) < 32) {
      normalized += JSON.stringify(character).slice(1, -1);
      continue;
    }
    normalized += character;
    if (escaped) escaped = false;
    else if (quoted && character === "\\") escaped = true;
    else if (character === '"') quoted = !quoted;
  }
  return JSON.parse(normalized);
}
