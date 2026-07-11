import { Link, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ResearchDashboardPage() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-10 px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-semibold">Research Exploration</h1>
          <p className="mt-2 max-w-3xl text-blue-50">
            Admin-only workbench pages for testing biological assumptions against the manta database.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-2">
        <Link to="/admin" className="text-sm text-blue-700 underline">
          Admin
        </Link>
        <span className="text-sm text-slate-600"> / Research Exploration</span>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <h2 className="font-semibold">Biopsy Age Rankings</h2>
                <p className="text-sm text-muted-foreground">
                  Compare observed biopsy records with adjustable maturity parameters and exploratory rank changes.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate("/admin/research/biopsy-age-rankings")}>
                Open Workbench
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <h2 className="font-semibold">Age-growth Exploration</h2>
                <p className="text-sm text-muted-foreground">
                  Review size histories, growth intervals, and suggested terminal-size defaults by sex.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate("/admin/research/age-growth-exploration")}>
                Open Growth Tool
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </Layout>
  );
}
