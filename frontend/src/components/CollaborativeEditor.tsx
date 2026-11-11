'use client';

import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { DocumentCollaboration } from '@/src/collab/DocumentCollaboration';

type Props = {
  collab: DocumentCollaboration;
  /** False makes the editor read-only; the server decides and enforces it as well. */
  editable: boolean;
};

const permission = (editable: boolean) => [
  EditorView.editable.of(editable),
  EditorState.readOnly.of(!editable),
];

/** A CodeMirror 6 Markdown editor bound to the shared text, with remote cursors and local-only undo. */
export function CollaborativeEditor({ collab, editable }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const permissionSlot = useRef(new Compartment());
  const initiallyEditable = useRef(editable);

  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: collab.text.toString(),
        extensions: [
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
          markdown(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown content' }),
          placeholder('# Start writing\n\nUse **bold**, *italic*, lists, and code blocks.'),
          permissionSlot.current.of(permission(initiallyEditable.current)),
          yCollab(collab.text, collab.awareness, { undoManager: collab.undoManager }),
        ],
      }),
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = undefined;
    };
  }, [collab]);

  useEffect(() => {
    view.current?.dispatch({ effects: permissionSlot.current.reconfigure(permission(editable)) });
  }, [editable]);

  return <div ref={host} className="markdown-editor cm-host" />;
}
