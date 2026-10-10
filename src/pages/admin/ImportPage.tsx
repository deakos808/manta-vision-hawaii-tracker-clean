import React from "react";
import Layout from "@/components/layout/Layout";

export default function ImportPage() {
  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Import Metadata</h1>
        <p role="status" className="text-sm text-muted-foreground">
          Legacy metadata import and staging actions are temporarily unavailable
          during the invite-only beta. No uploads, staging clears, or import
          commits can be performed from this page.
        </p>
      </div>
    </Layout>
  );
}
