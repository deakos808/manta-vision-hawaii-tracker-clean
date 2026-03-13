import { Link } from "react-router-dom";
import React from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import ReviewSubmissionsTile from "@/components/admin/ReviewSubmissionsTile";
import CalibrationTile from "@/components/admin/CalibrationTile";

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-10 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">Admin Dashboard</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-2">
        <Link to="/dashboard" className="text-sm text-blue-700 underline">
          Dashboard
        </Link>
        <span className="text-sm text-slate-600"> / Admin</span>
      </div>

      <div className="p-6 space-y-8">
        <Section title="Sighting Submissions">
          <ReviewSubmissionsTile />
        </Section>

        <Section title="Photogrammetry">
          <CalibrationTile />
        </Section>

        <Section title="Admin & Access">
          <AdminCard
            title="👥 Manage Admin Roles"
            desc="Add, edit, or archive users and assign admin roles."
            btn={{ label: "Manage Roles", onClick: () => navigate("/admin/roles") }}
          />
        </Section>

        <Section title="Data Integrity">
          <AdminCard
            title="🧪 Data Integrity Check"
            desc="Run consistency checks across catalog, mantas, sightings, and photos."
            btn={{ label: "Run Checks", onClick: () => navigate("/admin/data-integrity") }}
          />
          <AdminCard
            title="📥 Import Metadata"
            desc="Upload catalog, manta, sighting, and photo metadata."
            btn={{ label: "Go to Import", onClick: () => navigate("/admin/import") }}
          />
          <AdminCard
            title="📊 Export Data"
            desc="Download Excel exports for catalog review, QA, and duplicate-comparison workflows."
            btn={{ label: "Open Exports", onClick: () => navigate("/admin/exports") }}
          />
        </Section>

        <Section title="Best Photo Diagnostics">
          <AdminCard
            title="📷 Best Catalog Image Diagnostics"
            desc="Fix duplicate or missing best ventral/dorsal flags per catalog."
            btn={{ label: "Review Catalog Images", onClick: () => navigate("/admin/best-catalog") }}
          />
          <AdminCard
            title="🔎 Best Manta Image Diagnostics"
            desc="Fix duplicate or missing best ventral/dorsal flags per manta encounter."
            btn={{ label: "Review Manta Images", onClick: () => navigate("/admin/best-manta") }}
          />
          <AdminCard
            title="🪪 Missing Catalog Best Photos"
            desc="Find catalog entries missing best photo assignment and repair."
            btn={{ label: "Open Missing List", onClick: () => navigate("/admin/missing-catalog-photos") }}
          />
          <AdminCard
            title="🧭 Finding Duplicates"
            desc="Compare two catalog individuals side-by-side to spot duplicates."
            btn={{ label: "Open Tool", onClick: () => navigate("/admin/finding-duplicates") }}
          />
        </Section>

        <Section title="Matching Performance">
          <AdminCard
            title="🧪 Matching Diagnostics"
            desc="View embedding summary, CMC, rankings, and run updates."
            btn={{ label: "Open Matching", onClick: () => navigate("/admin/matching") }}
          />
        </Section>

        <Section title="App Diagnostics">
          <AdminCard
            title="🩺 App Diagnostics"
            desc="Verify deployment, tokens, and Supabase environment."
            btn={{ label: "View Environment", onClick: () => navigate("/admin/diagnostics") }}
          />
        </Section>
      </div>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold pt-2">{title}</h2>
      <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4">
        {children}
      </div>
    </section>
  );
}

interface CardBtn {
  label: string;
  onClick: () => void;
}

function AdminCard({ title, desc, btn }: { title: string; desc: string; btn: CardBtn }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{desc}</p>
        <Button variant="outline" onClick={btn.onClick}>
          {btn.label}
        </Button>
      </CardContent>
    </Card>
  );
}
