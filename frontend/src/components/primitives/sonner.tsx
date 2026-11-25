'use client';

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useTheme } from '@/src/hooks/useTheme';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'glass-overlay! rounded-xl! text-foreground! font-sans! gap-2.5!',
          description: 'text-muted-foreground!',
          actionButton: 'bg-accent-tint! text-accent-text! rounded-md! font-medium!',
          success: '[&_[data-icon]]:text-success',
          error: '[&_[data-icon]]:text-destructive',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--overlay)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--overlay-border)',
          '--border-radius': '12px',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
