import { ReactNode } from 'react';

interface RequireAuthProps {
  children: ReactNode;
  adminOnly?: boolean;
}

export default function RequireAuth({ children }: RequireAuthProps) {
  return <>{children}</>;
}
