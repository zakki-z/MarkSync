'use client';

import type { DocumentCollaboration } from '@/src/collab/DocumentCollaboration';
import { useDocumentText } from '@/src/hooks/useDocumentText';
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
  return <span>Markdown · {markdown.length.toLocaleString()} characters</span>;
}

export function LivePreview(props: Props) {
  return <MarkdownPreview markdown={useDocumentText(props.collab, props.live, props.fallback)} />;
}
