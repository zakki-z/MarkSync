import { AuthProvider } from '@/src/auth/AuthProvider';
import { SignedInFrame } from '@/src/components/SignedInFrame';

/**
 * Shared by every signed-in screen, so the session is resolved once and the sidebar stays mounted
 * while moving between workspaces, sections and documents.
 */
export default function SignedInLayout({ children }: LayoutProps<'/'>) {
  return (
    <AuthProvider>
      <SignedInFrame>{children}</SignedInFrame>
    </AuthProvider>
  );
}
