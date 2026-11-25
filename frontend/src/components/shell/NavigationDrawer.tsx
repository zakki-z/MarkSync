'use client';

import { Sheet, SheetContent, SheetTitle } from '@/src/components/primitives/sheet';
import { Sidebar, type SidebarProps } from '@/src/components/shell/Sidebar';

/** The sidebar as a drawer, for narrow screens. Loaded the first time it opens. */
export function NavigationDrawer({
  open,
  onOpenChange,
  sidebar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sidebar: SidebarProps;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[280px] max-w-[85vw] rounded-r-panel p-0"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Sidebar
          {...sidebar}
          onSearch={() => {
            onOpenChange(false);
            sidebar.onSearch();
          }}
          onNewWorkspace={() => {
            onOpenChange(false);
            sidebar.onNewWorkspace();
          }}
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
