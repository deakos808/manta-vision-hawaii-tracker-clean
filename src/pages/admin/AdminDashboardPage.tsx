import React from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="p-6 space-y-8">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Use the links below to access admin tools.
        </p>

        {/* Admin & Access */}
        <Section title="Admin & Access">
          <AdminCard
            title="👥 Manage Admin Roles"
            desc="Add, edit, or archive users and assign admin roles."
            btn={{ label: "Manage Roles", onClick: () => navigate("/admin/roles") }}
          />
        </Section>

        {/* Data Integrity */}
        <Section title="Data Integrity">
          <AdminCard
            title="🦮 Data Integrity Check"
            desc="Run consistency checks across catalog, mantas, sightings, and photos."
            btn={{ label: "Run Checks", onClick: () => navigate("/admin/data-integrity") }}
          />
          <AdminCard
            title="📥 Import Metadata"
            desc="Upload catalog, manta, sighting, and photo metadata."
            btn={{ label: "Go to Import", onClick: () => navigate("/admin/import") }}
          />
        </Section>

        {/* Best Photo Diagnostics */}
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
          {/* NEW: Finding Duplicates */}
          <AdminCard
            title="🧭 Finding Duplicates"
            desc="Compare two catalog individuals side-by-side to spot duplicates."
            btn={{ label: "Open Tool", onClick: () => navigate("/admin/finding-duplicates") }}
          />
        </Section>

        {/* Matching Performance */}
        <Section title="Matching Performance">
          <AdminCard
            title="🧪 Matching Diagnostics"
            desc="View embedding summary, CMC, rankings, and run updates."
            btn={{ label: "Open Matching", onClick: () => navigate("/admin/matching") }}
          />
        </Section>

        {/* App Diagnostics */}
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

function AdminCard({
  title,
  desc,
  btn,
}: {
  title: string;
  desc: string;
  btn: CardBtn;
}) {
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
