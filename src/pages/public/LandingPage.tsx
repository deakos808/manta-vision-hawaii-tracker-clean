// src/pages/LandingPage.tsx
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <Layout>
      <div className="bg-gradient-to-br from-blue-700 to-blue-500 text-white py-20 px-6 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold mb-4">Manta Ray Identification System</h1>
        <p className="text-lg sm:text-xl mb-8 max-w-2xl mx-auto">
          Track and identify manta rays across the Hawaiian Islands through their unique ventral spot patterns.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link to="/signin">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-100 font-semibold shadow-md">
              Sign In to Get Started
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white text-gray-800 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-10 text-center text-blue-700">Key Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="border rounded-xl p-6 shadow text-center hover:shadow-md transition">
              <h3 className="text-xl font-semibold mb-3">Image Recognition</h3>
              <p className="text-sm text-gray-600">
                Upload photos of manta rays for automatic identification using our advanced pattern matching algorithm.
              </p>
            </div>
            <div className="border rounded-xl p-6 shadow text-center hover:shadow-md transition">
              <h3 className="text-xl font-semibold mb-3">Comprehensive Database</h3>
              <p className="text-sm text-gray-600">
                Manage a full catalog of manta ray individuals with sighting histories, locations, and metadata.
              </p>
            </div>
            <div className="border rounded-xl p-6 shadow text-center hover:shadow-md transition">
              <h3 className="text-xl font-semibold mb-3">Analytics & Reporting</h3>
              <p className="text-sm text-gray-600">
                Generate insightful reports and export your data to support marine research and conservation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
