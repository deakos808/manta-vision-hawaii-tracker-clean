import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

export default function NotFoundPage() {
  const location = useLocation();

  useEffect(() => {
    console.error(
      '404 Error: User attempted to access non-existent route:',
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-800 mb-4">404</h1>
        <h2 className="text-2xl text-gray-600 mb-6">Page Not Found</h2>
        <p className="mb-4 text-gray-500">
          The page <code className="bg-white px-1 rounded">{location.pathname}</code> does not exist.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}
