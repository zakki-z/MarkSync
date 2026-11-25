'use client';

import type { DocumentCollaboration } from '@/src/collab/DocumentCollaboration';
import { countWords } from '@/src/components/document/editorState';
import { useDocumentText } from '@/src/hooks/useDocumentText';
import { useThrottledValue } from '@/src/hooks/useThrottledValue';
import { MarkdownPreview } from '@/src/MarkdownPreview';

type Props = {
  collab: DocumentCollaboration | undefined;
  /** The server's state has arrived, so the shared text replaces `fallback`. */
  live: boolean;
  fallback: string;
};

/*
 * Leaves of the document page that follow the text as it is typed. They own the subscription so
 * that DocumentEditor, with its inputs and the presence panel, does not re-render per keystroke.
 */

export function CharacterCount(props: Props) {
  const markdown = useDocumentText(props.collab, props.live, props.fallback);
  return <span>{markdown.length.toLocaleString()} characters</span>;
}

/** Word and character counts. Long documents are counted at most every PREVIEW_INTERVAL_MS. */
export function TextStats(props: Props) {
  const markdown = useDocumentText(props.collab, props.live, props.fallback);
  const shown = useThrottledValue(
    markdown,
    markdown.length > LARGE_DOCUMENT ? PREVIEW_INTERVAL_MS : 0,
  );
  const words = countWords(shown);
  return (
    <span>
      {words.toLocaleString()} {words === 1 ? 'word' : 'words'} · {shown.length.toLocaleString()}{' '}
      characters
    </span>
  );
}

/**
 * Parsing costs about 1.6 ms for 15 kB, 11 ms for 150 kB and 49 ms for 750 kB. Documents up to
 * this size are shown on every change; longer ones are refreshed at most every PREVIEW_INTERVAL_MS.
 */
const LARGE_DOCUMENT = 100_000;
const PREVIEW_INTERVAL_MS = 150;

export function LivePreview(props: Props) {
  const markdown = useDocumentText(props.collab, props.live, props.fallback);
  const shown = useThrottledValue(
    markdown,
    markdown.length > LARGE_DOCUMENT ? PREVIEW_INTERVAL_MS : 0,
  );
  return <MarkdownPreview markdown={shown} />;
}
