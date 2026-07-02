import { Link, useNavigate } from "react-router-dom";
import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

import ReviewSubmissionsTile from "@/components/admin/ReviewSubmissionsTile";
import DroneReviewSubmissionsTile from "@/components/admin/DroneReviewSubmissionsTile";
import CalibrationTile from "@/components/admin/CalibrationTile";

type SubmissionPayload = {
  photographer?: string | null;
  island?: string | null;
  sitelocation?: string | null;
  locationName?: string | null;
};

type SubmissionRow = {
  id: string;
  submitted_at: string | null;
  status: string | null;
  committed_at: string | null;
  committed_pk_sighting_id: number | null;
  sighting_date: string | null;
  email: string | null;
  photo_count: number | null;
  payload: SubmissionPayload | null;
};

type PhotoModalBaseRow = {
  pk_photo_id: number | null;
  fk_manta_id: number | null;
  fk_catalog_id: number | null;
  thumbnail_url: string | null;
};

type PhotoModalRow = PhotoModalBaseRow & {
  matchDisposition: "Match" | "New" | "—";
};

type MantaSightingRow = {
  fk_catalog_id: number | string | null;
  fk_sighting_id: number | string | null;
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);

  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoModalLoading, setPhotoModalLoading] = useState(false);
  const [photoModalError, setPhotoModalError] = useState<string | null>(null);
  const [photoModalRows, setPhotoModalRows] = useState<PhotoModalRow[]>([]);
  const [photoModalSubmission, setPhotoModalSubmission] = useState<SubmissionRow | null>(null);

  useEffect(() => {
    const loadRecentSubmissions = async () => {
      setSubmissionsLoading(true);
      setSubmissionsError(null);

      const { data, error } = await supabase
        .from("sighting_submissions")
        .select("id, submitted_at, status, committed_at, committed_pk_sighting_id, sighting_date, email, photo_count, payload")
        .order("submitted_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("[AdminDashboard] recent submissions error:", error);
        setSubmissionsError(error.message);
        setSubmissions([]);
      } else {
        setSubmissions((data ?? []) as SubmissionRow[]);
      }

      setSubmissionsLoading(false);
    };

    void loadRecentSubmissions();
  }, []);

  const pendingCount = useMemo(
    () => submissions.filter((row) => (row.status ?? "").toLowerCase() === "pending").length,
    [submissions],
  );

  const committedCount = useMemo(
    () => submissions.filter((row) => (row.status ?? "").toLowerCase() === "committed").length,
    [submissions],
  );

  const falseCommitCount = useMemo(
    () =>
      submissions.filter(
        (row) =>
          (row.status ?? "").toLowerCase() === "committed" &&
          row.committed_pk_sighting_id == null,
      ).length,
    [submissions],
  );

  async function openPhotoModal(row: SubmissionRow) {
    if (!row.committed_pk_sighting_id) return;

    setPhotoModalSubmission(row);
    setPhotoModalOpen(true);
    setPhotoModalLoading(true);
    setPhotoModalError(null);
    setPhotoModalRows([]);

    const sightingId = row.committed_pk_sighting_id;

    const { data: photosData, error: photosError } = await supabase
      .from("photos_with_photo_view")
      .select("pk_photo_id, fk_manta_id, fk_catalog_id, thumbnail_url")
      .eq("fk_sighting_id", sightingId)
      .order("pk_photo_id", { ascending: true });

    if (photosError) {
      console.error("[AdminDashboard] photo modal photos error:", photosError);
      setPhotoModalError(photosError.message);
      setPhotoModalLoading(false);
      return;
    }

    const baseRows = ((photosData ?? []) as PhotoModalBaseRow[]).map((photo) => ({
      pk_photo_id: photo.pk_photo_id ?? null,
      fk_manta_id: photo.fk_manta_id ?? null,
      fk_catalog_id: photo.fk_catalog_id ?? null,
      thumbnail_url: photo.thumbnail_url ?? null,
    }));

    const catalogIds = Array.from(
      new Set(
        baseRows
          .map((rowItem) => rowItem.fk_catalog_id)
          .filter((value): value is number => typeof value === "number"),
      ),
    );

    if (catalogIds.length === 0) {
      setPhotoModalRows(
        baseRows.map((photo) => ({
          ...photo,
          matchDisposition: "—",
        })),
      );
      setPhotoModalLoading(false);
      return;
    }

    const { data: mantaRows, error: mantaError } = await supabase
      .from("mantas")
      .select("fk_catalog_id, fk_sighting_id")
      .in("fk_catalog_id", catalogIds);

    if (mantaError) {
      console.error("[AdminDashboard] photo modal mantas error:", mantaError);
      setPhotoModalError(mantaError.message);
      setPhotoModalLoading(false);
      return;
    }

    const earliestByCatalog = new Map<number, number>();

    for (const rowItem of (mantaRows ?? []) as MantaSightingRow[]) {
      const catalogId = Number(rowItem.fk_catalog_id ?? 0);
      const rowSightingId = Number(rowItem.fk_sighting_id ?? 0);

      if (!catalogId || !rowSightingId) continue;

      const existing = earliestByCatalog.get(catalogId);
      if (existing == null || rowSightingId < existing) {
        earliestByCatalog.set(catalogId, rowSightingId);
      }
    }

    const hydratedRows: PhotoModalRow[] = baseRows.map((photo) => {
      const catalogId = photo.fk_catalog_id;
      const earliestSightingId =
        typeof catalogId === "number" ? earliestByCatalog.get(catalogId) : undefined;

      let matchDisposition: "Match" | "New" | "—" = "—";
      if (typeof earliestSightingId === "number") {
        matchDisposition = earliestSightingId < sightingId ? "Match" : "New";
      }

      return {
        ...photo,
        matchDisposition,
      };
    });

    setPhotoModalRows(hydratedRows);
    setPhotoModalLoading(false);
  }

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
        <Section title="Recent Underwater Submissions">
          <Card className="md:col-span-2">
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Latest 10 submissions</h3>
                  <p className="text-sm text-muted-foreground">
                    Monitor recent underwater intake status before and after admin commit.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setRecentOpen((prev) => !prev)}>
                    {recentOpen ? "Collapse Panel" : "Expand Panel"}
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin/review")}>
                    Open Review Queue
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MiniStatCard label="Pending" value={pendingCount} />
                <MiniStatCard label="Committed" value={committedCount} />
                <MiniStatCard label="False Commits" value={falseCommitCount} />
              </div>

              {submissionsError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Failed to load recent submissions: {submissionsError}
                </div>
              ) : null}

              {recentOpen ? (
                <div className="overflow-x-auto">
                  {submissionsLoading ? (
                    <div className="py-6 text-sm text-muted-foreground">Loading recent submissions...</div>
                  ) : submissions.length === 0 ? (
                    <div className="py-6 text-sm text-muted-foreground">No recent underwater submissions found.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Submitted</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Sighting Date</th>
                          <th className="px-3 py-2 font-semibold">Photographer</th>
                          <th className="px-3 py-2 font-semibold">Island</th>
                          <th className="px-3 py-2 font-semibold">Location</th>
                          <th className="px-3 py-2 font-semibold">Sighting ID</th>
                          <th className="px-3 py-2 font-semibold">Total Photos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.map((row) => {
                          const payloadLocation =
                            row.payload?.sitelocation ??
                            row.payload?.locationName ??
                            "—";

                          const photoCountValue = row.photo_count ?? 0;
                          const canOpenPhotos =
                            (row.status ?? "").toLowerCase() === "committed" &&
                            row.committed_pk_sighting_id != null &&
                            photoCountValue > 0;

                          return (
                            <tr key={row.id} className="border-t">
                              <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.submitted_at)}</td>
                              <td className="px-3 py-2">
                                <StatusBadge status={row.status} />
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">{row.sighting_date ?? "—"}</td>
                              <td className="px-3 py-2">{row.payload?.photographer ?? row.email ?? "—"}</td>
                              <td className="px-3 py-2">{row.payload?.island ?? "—"}</td>
                              <td className="px-3 py-2">{payloadLocation}</td>
                              <td className="px-3 py-2">{row.committed_pk_sighting_id ?? "—"}</td>
                              <td className="px-3 py-2">
                                {canOpenPhotos ? (
                                  <button
                                    type="button"
                                    className="text-blue-700 underline underline-offset-2"
                                    onClick={() => void openPhotoModal(row)}
                                  >
                                    {photoCountValue}
                                  </button>
                                ) : (
                                  <span>{photoCountValue}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Panel collapsed. Expand to view the latest 10 submission rows.
                </div>
              )}
            </CardContent>
          </Card>
        </Section>

        <Section title="Sighting Submissions">
          <ReviewSubmissionsTile />
          <DroneReviewSubmissionsTile />
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
            desc="Run consistency checks across catalog, manta encounters, sightings, and photos."
            btn={{ label: "Run Checks", onClick: () => navigate("/admin/data-integrity") }}
          />
          <AdminCard
            title="Data Quality Control"
            desc="Review local QC scripts and domain pages for Catalog, Sightings, Mantas, Photos, Sizes, Biopsies, and Storage/Exports."
            btn={{ label: "Open QC", onClick: () => navigate("/admin/qc") }}
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
            title="🧪 Matching Performance"
            desc="View self-match rank distribution, low performers, and local matcher batch commands."
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

      <Dialog
        open={photoModalOpen}
        onOpenChange={(open) => {
          setPhotoModalOpen(open);
          if (!open) {
            setPhotoModalError(null);
            setPhotoModalRows([]);
            setPhotoModalSubmission(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Committed Photo Records</DialogTitle>
            <DialogDescription>
              {photoModalSubmission?.committed_pk_sighting_id
                ? `Sighting ID ${photoModalSubmission.committed_pk_sighting_id}`
                : "Photo detail view"}
            </DialogDescription>
          </DialogHeader>

          {photoModalError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Failed to load photo detail: {photoModalError}
            </div>
          ) : null}

          {photoModalLoading ? (
            <div className="py-6 text-sm text-muted-foreground">Loading photo detail...</div>
          ) : photoModalRows.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">No committed photo rows found for this sighting.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Thumbnail</th>
                    <th className="px-3 py-2 font-semibold">Photo ID</th>
                    <th className="px-3 py-2 font-semibold">Manta ID</th>
                    <th className="px-3 py-2 font-semibold">Catalog ID</th>
                    <th className="px-3 py-2 font-semibold">Match or New</th>
                  </tr>
                </thead>
                <tbody>
                  {photoModalRows.map((row) => (
                    <tr key={String(row.pk_photo_id ?? Math.random())} className="border-t">
                      <td className="px-3 py-2">
                        <img
                          src={row.thumbnail_url || "/manta-logo.svg"}
                          alt="photo thumbnail"
                          className="h-16 w-16 rounded object-cover border"
                          onError={(event) => {
                            (event.currentTarget as HTMLImageElement).src = "/manta-logo.svg";
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">{row.pk_photo_id ?? "—"}</td>
                      <td className="px-3 py-2">{row.fk_manta_id ?? "—"}</td>
                      <td className="px-3 py-2">{row.fk_catalog_id ?? "—"}</td>
                      <td className="px-3 py-2">{row.matchDisposition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
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

function MiniStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const normalized = (status ?? "").toLowerCase();

  const className =
    normalized === "pending"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : normalized === "committed"
        ? "bg-green-100 text-green-800 border-green-200"
        : normalized === "rejected"
          ? "bg-red-100 text-red-800 border-red-200"
          : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {status ?? "unknown"}
    </span>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}
