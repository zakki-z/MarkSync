'use client';

import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { DocumentCollaboration } from '@/src/collab/DocumentCollaboration';
import type { CursorStore } from '@/src/components/document/editorState';

type Props = {
  collab: DocumentCollaboration;
  /** False makes the editor read-only; the server decides and enforces it as well. */
  editable: boolean;
  /** Receives the cursor position for the status bar; it is never React state. */
  cursor?: CursorStore;
};

const permission = (editable: boolean) => [
  EditorView.editable.of(editable),
  EditorState.readOnly.of(!editable),
];

/**
 * A CodeMirror 6 Markdown editor bound to the shared text, with remote cursors, local-only undo
 * and line numbers.
 */
export function CollaborativeEditor({ collab, editable, cursor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const permissionSlot = useRef(new Compartment());
  const initiallyEditable = useRef(editable);
  const cursorStore = useRef(cursor);
  useEffect(() => {
    cursorStore.current = cursor;
  });

  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: collab.text.toString(),
        extensions: [
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
          markdown(),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.selectionSet && !update.docChanged) return;
            const { main } = update.state.selection;
            const line = update.state.doc.lineAt(main.head);
            cursorStore.current?.set({
              line: line.number,
              column: main.head - line.from + 1,
              selected: main.to - main.from,
            });
          }),
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

  return <div ref={host} className="cm-host" />;
}
