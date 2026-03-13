import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";

import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type CatalogExportRow = {
  pk_catalog_id: number | null;
  name: string | null;
  species: string | null;
  gender: string | null;
  age_class: string | null;
  first_sighting: string | null;
  last_sighting: string | null;
  last_size_m: number | null;
  total_sightings: number | null;
  total_biopsies: number | null;
  total_sizes: number | null;
  mprf: string | boolean | null;
  populations: string[] | null;
  islands: string[] | null;
  sitelocation: string | null;
  best_catalog_ventral_thumb_url: string | null;
  best_catalog_ventral_path: string | null;
  best_catalog_dorsal_thumb_url: string | null;
  best_catalog_dorsal_path: string | null;
  best_catalog_photo_url: string | null;
  thumbnail_url: string | null;
};

type ExportRecipe =
  | "mobula_birostris_best_ventral"
  | "full_catalog_best_ventral"
  | "mprf_comparison_export";

const PAGE_SIZE = 1000;

async function loadAllCatalogRows(): Promise<CatalogExportRow[]> {
  const allRows: CatalogExportRow[] = [];

  for (let from = 0; from < 500000; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("catalog_with_photo_view")
      .select("*")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as CatalogExportRow[];
    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) break;
  }

  return allRows;
}

function normalizeName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toUpperCase()
    .replace(/^MP[\s_\-:]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildImageUrl(row: CatalogExportRow): string {
  return (
    row.best_catalog_ventral_thumb_url ||
    row.best_catalog_ventral_path ||
    row.best_catalog_photo_url ||
    row.thumbnail_url ||
    ""
  );
}

function buildFilename(recipe: ExportRecipe): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (recipe === "mobula_birostris_best_ventral") {
    return `catalog_mobula_birostris_best_ventral_${stamp}.xlsx`;
  }

  if (recipe === "mprf_comparison_export") {
    return `catalog_mprf_comparison_export_${stamp}.xlsx`;
  }

  return `catalog_full_best_ventral_${stamp}.xlsx`;
}

function buildExportRows(rows: CatalogExportRow[], recipe: ExportRecipe) {
  if (recipe === "mprf_comparison_export") {
    return rows.map((row) => {
      const imageUrl = buildImageUrl(row);

      return {
        catalog_id: row.pk_catalog_id ?? "",
        name: row.name ?? "",
        normalized_name: normalizeName(row.name),
        species: row.species ?? "",
        gender: row.gender ?? "",
        age_class: row.age_class ?? "",
        first_sighting: row.first_sighting ?? "",
        last_sighting: row.last_sighting ?? "",
        last_size_m: row.last_size_m ?? "",
        total_sightings: row.total_sightings ?? 0,
        total_sizes: row.total_sizes ?? 0,
        total_biopsies: row.total_biopsies ?? 0,
        mprf: row.mprf ?? "",
        populations: Array.isArray(row.populations) ? row.populations.join(", ") : "",
        islands: Array.isArray(row.islands) ? row.islands.join(", ") : "",
        sitelocation: row.sitelocation ?? "",
        image_link: imageUrl ? "Open Image" : "",
        best_catalog_ventral_thumb_url: row.best_catalog_ventral_thumb_url ?? "",
        best_catalog_ventral_path: row.best_catalog_ventral_path ?? "",
        best_catalog_photo_url: row.best_catalog_photo_url ?? "",
      };
    });
  }

  return rows.map((row) => {
    const imageUrl = buildImageUrl(row);

    return {
      catalog_id: row.pk_catalog_id ?? "",
      name: row.name ?? "",
      species: row.species ?? "",
      gender: row.gender ?? "",
      age_class: row.age_class ?? "",
      first_sighting: row.first_sighting ?? "",
      last_sighting: row.last_sighting ?? "",
      last_size_m: row.last_size_m ?? "",
      total_sightings: row.total_sightings ?? 0,
      total_sizes: row.total_sizes ?? 0,
      total_biopsies: row.total_biopsies ?? 0,
      mprf: row.mprf ?? "",
      populations: Array.isArray(row.populations) ? row.populations.join(", ") : "",
      islands: Array.isArray(row.islands) ? row.islands.join(", ") : "",
      sitelocation: row.sitelocation ?? "",
      image_link: imageUrl ? "Open Image" : "",
      best_catalog_ventral_thumb_url: row.best_catalog_ventral_thumb_url ?? "",
      best_catalog_ventral_path: row.best_catalog_ventral_path ?? "",
      best_catalog_dorsal_thumb_url: row.best_catalog_dorsal_thumb_url ?? "",
      best_catalog_dorsal_path: row.best_catalog_dorsal_path ?? "",
      best_catalog_photo_url: row.best_catalog_photo_url ?? "",
    };
  });
}

function writeWorkbook(params: {
  recipe: ExportRecipe;
  sourceRows: CatalogExportRow[];
  sourceLabel: string;
  filterSummary: string;
}) {
  const { recipe, sourceRows, sourceLabel, filterSummary } = params;

  const rowsToExport = buildExportRows(sourceRows, recipe);
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(rowsToExport);

  const headerKeys = Object.keys(rowsToExport[0] ?? {});
  const imageLinkCol = headerKeys.indexOf("image_link");

  if (imageLinkCol >= 0) {
    for (let i = 0; i < sourceRows.length; i += 1) {
      const previewUrl = buildImageUrl(sourceRows[i]);
      if (!previewUrl) continue;

      const safeUrl = String(previewUrl).replace(/"/g, '""');
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: imageLinkCol });

      summarySheet[cellRef] = {
        t: "str",
        f: `HYPERLINK("${safeUrl}","Open Image")`,
        v: "Open Image",
      };
    }
  }

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Catalog Summary");

  const notesRows = [
    { field: "export_recipe", value: recipe },
    { field: "exported_at", value: new Date().toISOString() },
    { field: "row_count", value: String(rowsToExport.length) },
    { field: "source", value: sourceLabel },
    { field: "filter_summary", value: filterSummary || "none" },
  ];

  const notesSheet = XLSX.utils.json_to_sheet(notesRows);
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Export Notes");

  XLSX.writeFile(workbook, buildFilename(recipe));
}

export default function AdminExportsPage() {
  const [loadingRecipe, setLoadingRecipe] = useState<ExportRecipe | null>(null);
  const [lastMessage, setLastMessage] = useState<string>("");

  const recipeCards = useMemo(
    () => [
      {
        key: "mobula_birostris_best_ventral" as ExportRecipe,
        title: "Mobula birostris Best Ventral Export",
        desc: "Export Mobula birostris catalog rows with best ventral image links for Excel review and comparison workflows.",
      },
      {
        key: "mprf_comparison_export" as ExportRecipe,
        title: "MPRF Comparison Export",
        desc: "Export Mobula birostris rows with normalized names and best ventral image links for direct comparison against the MPRF spreadsheet.",
      },
      {
        key: "full_catalog_best_ventral" as ExportRecipe,
        title: "Full Catalog Best Ventral Export",
        desc: "Export the full catalog with best ventral image links and key identifying metadata.",
      },
    ],
    []
  );

  const runExport = async (recipe: ExportRecipe) => {
    try {
      setLoadingRecipe(recipe);
      setLastMessage("");

      const rows = await loadAllCatalogRows();

      const filtered =
        recipe === "full_catalog_best_ventral"
          ? rows
          : rows.filter((row) => (row.species ?? "").trim().toLowerCase() === "mobula birostris");

      writeWorkbook({
        recipe,
        sourceRows: filtered,
        sourceLabel: "catalog_with_photo_view",
        filterSummary:
          recipe === "mobula_birostris_best_ventral"
            ? "species = Mobula birostris; preferred image link = best ventral thumb/path/photo URL fallback chain"
            : recipe === "mprf_comparison_export"
              ? "species = Mobula birostris; includes normalized_name with MP-prefix removal for MPRF comparison"
              : "full catalog export; preferred image link = best ventral thumb/path/photo URL fallback chain",
      });

      setLastMessage(`Export complete: ${filtered.length} row(s).`);
    } catch (error) {
      console.error("[AdminExportsPage]", error);
      setLastMessage("Export failed. Check console for details.");
      alert("Export failed. Check console for details.");
    } finally {
      setLoadingRecipe(null);
    }
  };

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-10 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">Admin Exports</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-2">
        <Link to="/admin" className="text-sm text-blue-700 underline">
          Admin
        </Link>
        <span className="text-sm text-slate-600"> / Exports</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardContent className="p-5 space-y-2">
            <h2 className="text-lg font-semibold">Catalog Export Tools</h2>
            <p className="text-sm text-muted-foreground">
              These exports are read-only and intended for analysis, QA, external comparison, and Excel-based review.
            </p>
            <p className="text-sm text-muted-foreground">
              Current source: <span className="font-medium">catalog_with_photo_view</span>
            </p>
          </CardContent>
        </Card>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recipeCards.map((recipe) => {
            const running = loadingRecipe === recipe.key;

            return (
              <Card key={recipe.key}>
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-semibold">{recipe.title}</h3>
                  <p className="text-sm text-muted-foreground">{recipe.desc}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runExport(recipe.key)}
                    disabled={loadingRecipe !== null}
                  >
                    {running ? "Exporting..." : "Download Excel"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {lastMessage ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm">{lastMessage}</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Layout>
  );
}
