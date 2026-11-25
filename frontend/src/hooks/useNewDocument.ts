import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreateDocument } from '@/src/queries/mutations';

/**
 * Creates an "Untitled document" in a workspace and opens it, from any place that offers the
 * action (top bar, quick actions, command palette). The request and the title are the same as
 * before; a failure is reported with a toast and the user stays where they are.
 */
export function useNewDocument() {
  const router = useRouter();
  const createDocument = useCreateDocument().mutateAsync;
  const [creating, setCreating] = useState(false);
  const pending = useRef(false);

  const create = useCallback(
    async (workspaceId: number) => {
      if (pending.current) return;
      pending.current = true;
      setCreating(true);
      try {
        const created = await createDocument({
          workspaceId,
          draft: { title: 'Untitled document', markdown: '' },
        });
        toast.success('Document created');
        router.push(`/w/${workspaceId}/d/${created.id}`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Unable to create document.');
      } finally {
        pending.current = false;
        setCreating(false);
      }
    },
    [createDocument, router],
  );

  return { create, creating };
}
