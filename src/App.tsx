// File: src/App.tsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import SignOutPage from "@/pages/auth/SignOutPage";
import RequireAuth from "@/components/auth/RequireAuth";


import LandingPage from "@/pages/public/LandingPage";
import NotFoundPage from "@/pages/public/NotFoundPage";
import SignInPage from "@/pages/auth/SignInPage";
import DashboardPage from "@/pages/admin/DashboardPage";
import ImportPage from "@/pages/admin/ImportPage";
import AdminAddSightingPage from "@/pages/admin/AddSightingPage";

import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminRolesPage from "@/pages/admin/AdminRolesPage";
import AdminReviewNewSightingsPage from "@/pages/admin/AdminReviewNewSightingsPage";
import ReviewSightingDetailsPage from "@/pages/admin/ReviewSightingDetailsPage";

import DataIntegrityPage from "@/pages/admin/DataIntegrityPage";
import BestMantaImageDiagnostics from "@/pages/admin/BestMantaImageDiagnostics";
import BestCatalogImageDiagnostics from "@/pages/admin/BestCatalogImageDiagnostics";
import MissingCatalogPhotosPage from "@/pages/admin/MissingCatalogPhotosPage";
import MissingSightingPhotosPage from "@/pages/admin/MissingSightingPhotosPage";
import ChooseBestMantaPhotoPage from "@/pages/admin/ChooseBestMantaPhotoPage";
import FindingDuplicatesPage from "@/pages/admin/FindDuplicates/FindingDuplicatesPage";

import SetPasswordPage from "@/pages/auth/SetPasswordPage";
import MatchingPage from "@/pages/admin/MatchingPage";
import MatchDiagnosticsPage from "@/pages/admin/MatchDiagnosticsPage";
import MantaDiagnosticsPage from "@/pages/admin/MantaDiagnosticsPage";
import MantaMatchDiagnosticsPage from "@/pages/admin/MantaMatchDiagnosticsPage";
import MantaPhotoDiagnosticsPage from "@/pages/admin/MantaPhotoDiagnosticsPage";
import TestMatchPage from "@/pages/matching/TestMatchPage";

import DiagnosticsPage from "@/pages/admin/DiagnosticsPage";
import CsvDataReviewPage from "@/pages/admin/CsvDataReviewPage";
import CsvDebugPage from "@/pages/admin/CsvDebugPage";

import BrowseData from "@/pages/browse_data/BrowseData";
import UsersInvitePage from "@/pages/admin/UsersInvitePage";
import Photos from "@/pages/browse_data/Photos";
import Mantas from "@/pages/browse_data/Mantas";
import Catalog from "@/pages/browse_data/Catalog";
import Sightings from "@/pages/browse_data/Sightings";

function App() {
  return (
    <Routes>

      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
              <Route path="/signin" element={<SignInPage />} />
        <Route path="/signout" element={<SignOutPage />} />
} />

      <Route path="/login" element={<Navigate to="/signin" replace />} />

      {/* Browse — add redirect so /browse lands on /browse/photos */}
      <Route path="/browse" element={<Navigate to="/browse/photos" replace />} />
      <Route path="/browse/data" element={<BrowseData />} />
      <Route path="/browse/catalog" element={<Catalog />} />
      <Route path="/browse/sightings" element={<Sightings />} />
      <Route path="/browse/photos" element={<Photos />} />
      <Route path="/browse/mantas" element={<Mantas />} />

      {/* Developer Tools */}
      <Route path="/test-match-ui" element={<TestMatchPage />} />

      {/* Protected User Routes */}
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/import"
        element={
          <RequireAuth>
            <ImportPage />
          </RequireAuth>
        }
      /></RequireAuth>
          }
        />
        <Route
          path="/sightings/add"
          element={
            <RequireAuth>
              <AddSightingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sightings/add2"
          element={
            <RequireAuth>
              <SightingQuickForm />
            </RequireAuth>
          }
        />
</RequireAuth>
          }
        />
</RequireAuth>
          }
        />

      {/* Admin Dashboard Hub */}
      <Route
        path="/admin"
        element={<RequireAuth adminOnly><AdminDashboardPage /></RequireAuth>}
      />

      {/* Admin Sections */}
      <Route
        path="/admin/import"
        element={
          <RequireAuth adminOnly>
            <ImportPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/data-integrity"
        element={
          <RequireAuth adminOnly>
            <DataIntegrityPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/best-images"
        element={
          <RequireAuth adminOnly>
            <BestMantaImageDiagnostics />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/best-manta"
        element={
          <RequireAuth adminOnly>
            <BestMantaImageDiagnostics />
          </RequireAuth>
        }
      />
      {/* NEW: clean route for Catalog best-photo tool */}
      <Route
        path="/admin/best-catalog"
        element={
          <RequireAuth adminOnly>
            <BestCatalogImageDiagnostics />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/matching"
        element={
          <RequireAuth adminOnly>
            <MatchingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/diagnostics"
        element={
          <RequireAuth adminOnly>
            <DiagnosticsPage />
          </RequireAuth>
        }
      />

      {/* Admin Subtools */}
      <Route
        path="/admin/roles"
        element={
          <RequireAuth adminOnly>
            <AdminRolesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users-invite"
        element={
          <RequireAuth adminOnly>
            <UsersInvitePage />
          </RequireAuth>
        }
      />

      <Route
        path="/admin/photo-test"
        element={
          <RequireAuth adminOnly>
            <TestMatchPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/match-diagnostics"
        element={
          <RequireAuth adminOnly>
            <MatchDiagnosticsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/manta-diagnostics"
        element={
          <RequireAuth adminOnly>
            <MantaDiagnosticsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/manta-match-diagnostics"
        element={
          <RequireAuth adminOnly>
            <MantaMatchDiagnosticsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/manta-photo-diagnostics"
        element={
          <RequireAuth adminOnly>
            <MantaPhotoDiagnosticsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/missing-catalog-photos"
        element={
          <RequireAuth adminOnly>
            <MissingCatalogPhotosPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/missing-sighting-photos"
        element={
          <RequireAuth adminOnly>
            <MissingSightingPhotosPage />
          </RequireAuth>
        }
      />
      {/* Keep legacy route working */}
      <Route
        path="/admin/best-catalog-selector"
        element={
          <RequireAuth adminOnly>
            <BestCatalogImageDiagnostics />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/manta/:id/photos"
        element={
          <RequireAuth adminOnly>
            <ChooseBestMantaPhotoPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/review"
        element={
          <RequireAuth adminOnly>
            <AdminReviewNewSightingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/review/sighting/:id"
        element={
          <RequireAuth adminOnly>
            <ReviewSightingDetailsPage />
          </RequireAuth>
        }
      />

      {/* CSV / Diagnostics */}
      <Route
        path="/admin/diagnostics-csv"
        element={
          <RequireAuth adminOnly>
            <CsvDataReviewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/csv-debug"
        element={
          <RequireAuth adminOnly>
            <CsvDebugPage />
          </RequireAuth>
        }
      />

      {/* NEW: Finding Duplicates (both hyphen and underscore aliases) */}
      <Route
        path="/admin/finding-duplicates"
        element={
          <RequireAuth adminOnly>
            <FindingDuplicatesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/finding_duplicates"
        element={
          <RequireAuth adminOnly>
            <FindingDuplicatesPage />
          </RequireAuth>
        }
      />

      {/* 404 Fallback */}
      <Route path="*" element={<NotFoundPage />} />      <Route path="/set-password" element={<SetPasswordPage />} />

    </Routes>
  );
}

export default App;
