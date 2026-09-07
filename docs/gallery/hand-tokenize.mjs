export function keywordRule(words, capture) {
  const set = new Set(words);
  return { test: (word) => set.has(word), capture };
}

const WORD_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER_RE = /^\d+(\.\d+)?/;
const STRING_RE = /^"[^"]*"|^'[^']*'|^\/[^/]*\//;

export function tokenizeLine(line, rules, opts = {}) {
  const commentStarts = opts.lineCommentStarts || [];
  const trimmed = line.replace(/^\s*/, "");
  const leadingWs = line.slice(0, line.length - trimmed.length);
  if (commentStarts.some((prefix) => trimmed.startsWith(prefix))) {
    const spans = [];
    if (leadingWs) spans.push({ text: leadingWs });
    spans.push({ text: trimmed, capture: "comment" });
    return spans;
  }

  const spans = [];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);

    const stringMatch = rest.match(STRING_RE);
    if (stringMatch && stringMatch.index === 0) {
      spans.push({ text: stringMatch[0], capture: "string" });
      i += stringMatch[0].length;
      continue;
    }

    const numberMatch = rest.match(NUMBER_RE);
    if (numberMatch && numberMatch.index === 0) {
      spans.push({ text: numberMatch[0], capture: "number" });
      i += numberMatch[0].length;
      continue;
    }

    const wordMatch = rest.match(WORD_RE);
    if (wordMatch && wordMatch.index === 0) {
      const word = wordMatch[0];
      const rule = rules.find((r) => r.test(word));
      spans.push({ text: word, capture: rule ? rule.capture : undefined });
      i += word.length;
      continue;
    }

    spans.push({ text: line[i], capture: "punctuation" });
    i += 1;
  }
  return spans;
}

export function tokenizeText(text, rules, opts = {}) {
  return text.split("\n").map((line) => tokenizeLine(line, rules, opts));
}
