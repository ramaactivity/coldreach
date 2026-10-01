/**
 * The new text of a reply: everything before the quoted original ("On … wrote:",
 * "Pada … menulis:", Outlook's "From:/Dari:" header block, "-----Original
 * Message-----"), minus ">"-quoted lines, capped at `max` characters.
 * Self-check: node scripts/check-reply-snippet.mjs
 */
const QUOTE_START = [
  /^On .+wrote:\s*$/i,
  /^Pada .+menulis:\s*$/i,
  /^-{2,}\s*(Original Message|Pesan Asli|Forwarded message)/i,
  /^_{10,}\s*$/,
  /^(From|Dari|Sent|Dikirim):\s/i,
];

export function replySnippet(text: string, max = 2000): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Gmail wraps a long "On <date>, <name> <email> wrote:" over two lines.
    const joined = i + 1 < lines.length ? `${line} ${lines[i + 1].trim()}` : line;
    if (QUOTE_START.some((re) => re.test(line) || re.test(joined))) break;
    if (line.startsWith(">")) continue;
    kept.push(lines[i].trimEnd());
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
