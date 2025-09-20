// src/pages/PublicLandingPage.tsx
import { Link } from 'react-router-dom';

export default function PublicLandingPage() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-4xl font-bold text-blue-800 mb-4">Hawaii Manta Tracker</h1>
      <p className="text-lg text-gray-700 max-w-xl mb-6">
        Track and identify manta rays across Hawaii using unique belly spot patterns.
        Contribute to research and conservation by uploading sightings and browsing the catalog.
      </p>

      <div className="flex gap-4">
        <Link to="/signin">
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow transition">
            Sign In
          </button>
        </Link>
        <Link to="/signup">
          <button className="bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold px-6 py-3 rounded-lg shadow transition">
            Sign Up
          </button>
        </Link>
      </div>
    </div>
  );
}
