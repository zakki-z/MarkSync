import React from 'react';

/**
 * A deliberately small, safe Markdown subset for the walking skeleton.
 * React escapes raw HTML automatically; no dangerouslySetInnerHTML is used.
 * Supports headings, paragraphs, lists, quotes, fenced code and basic inline syntax.
 * Replace with react-markdown/remark-gfm when full CommonMark support is needed.
 */
function inlineMarkup(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\(([^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    const key = `${index}-${parts.length}`;
    if (match[2] !== undefined) {
      const url = match[3];
      // Never create javascript:, data:, or protocol-relative links from user-authored Markdown.
      const safe = /^(https?:\/\/|mailto:|\/[^/]|#)/i.test(url);
      parts.push(safe
        ? <a key={key} href={url} target="_blank" rel="noopener noreferrer">{match[2]}</a>
        : match[2]);
    } else if (match[4] !== undefined) {
      parts.push(<code key={key}>{match[4]}</code>);
    } else if (match[5] !== undefined) {
      parts.push(<strong key={key}>{match[5]}</strong>);
    } else if (match[6] !== undefined) {
      parts.push(<em key={key}>{match[6]}</em>);
    } else if (match[7] !== undefined) {
      parts.push(<del key={key}>{match[7]}</del>);
    }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <p className="preview-empty">Your Markdown preview will appear here as you type.</p>;
  }

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const key = index;

    if (/^\s*```/.test(line)) {
      const language = line.replace(/^\s*```/, '').trim();
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        code.push(lines[index++]);
      }
      if (index < lines.length) index++;
      nodes.push(<pre key={key}><code data-language={language || undefined}>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const children = inlineMarkup(heading[2]);
      // Explicit cases keep heading types predictable in React/TypeScript.
      switch (level) {
        case 1: nodes.push(<h1 key={key}>{children}</h1>); break;
        case 2: nodes.push(<h2 key={key}>{children}</h2>); break;
        case 3: nodes.push(<h3 key={key}>{children}</h3>); break;
        case 4: nodes.push(<h4 key={key}>{children}</h4>); break;
        case 5: nodes.push(<h5 key={key}>{children}</h5>); break;
        default: nodes.push(<h6 key={key}>{children}</h6>);
      }
      index++;
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      nodes.push(<hr key={key} />);
      index++;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const content: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        content.push(lines[index++].replace(/^\s*>\s?/, ''));
      }
      nodes.push(<blockquote key={key}>{content.map((text, i) => <p key={i}>{inlineMarkup(text)}</p>)}</blockquote>);
      continue;
    }

    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const entries: React.ReactNode[] = [];
      const listExpression = unordered ? /^\s*[-*+]\s+/ : /^\s*\d+\.\s+/;
      while (index < lines.length && listExpression.test(lines[index])) {
        entries.push(<li key={index}>{inlineMarkup(lines[index].replace(listExpression, ''))}</li>);
        index++;
      }
      nodes.push(unordered ? <ul key={key}>{entries}</ul> : <ol key={key}>{entries}</ol>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() &&
      !/^(#{1,6}\s|\s*```|\s*>|\s*[-*+]\s+|\s*\d+\.\s+)/.test(lines[index])) {
      paragraph.push(lines[index++]);
    }
    if (paragraph.length) nodes.push(<p key={key}>{inlineMarkup(paragraph.join(' '))}</p>);
    else index++; // Always advance, even for malformed Markdown.
  }
  return <article className="markdown-content">{nodes}</article>;
}
