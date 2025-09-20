
import { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { Toaster } from 'sonner';

interface AppLayoutProps {
  children?: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 container py-6 md:py-10 px-4 md:px-8">
        {children || <Outlet />}
      </main>
      <footer className="bg-muted py-6 mt-auto">
        <div className="container px-4 text-center text-muted-foreground text-sm">
          <p>© {new Date().getFullYear()} Hawaii Manta Tracker. All rights reserved.</p>
          <p className="mt-1">Developed to protect and study manta ray populations in Hawaiian waters.</p>
        </div>
      </footer>
      <Toaster />
    </div>
  );
};

export default AppLayout;
