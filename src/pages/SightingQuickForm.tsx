import React from "react";
import Layout from "@/components/layout/Layout";

export default function SightingQuickForm() {
  console.info("[SightingQuickForm] mounted");
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">Sighting Quick Form (Map‑free)</h1>
        <p className="text-sm text-muted-foreground mt-2" data-testid="alive">
          Route is alive. We will wire the full form and DB submit next.
        </p>
      </div>
    </Layout>
  );
}
