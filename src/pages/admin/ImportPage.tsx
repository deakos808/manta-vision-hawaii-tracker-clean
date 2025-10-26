// File: src/pages/admin/ImportPage.tsx

import React from "react";
import Layout from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import UniversalCsvUpdateTool from "@/components/admin/UniversalCsvUpdateTool";
import CatalogStagingPanel from "@/components/importTools/CatalogStagingPanel";

export default function ImportPage() {
  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Import Metadata</h1>
        <p className="text-sm text-muted-foreground">
          Upload CSV metadata for each core table. Each tab provides a dedicated uploader.
        </p>

        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="mantas">Mantas</TabsTrigger>
            <TabsTrigger value="sightings">Sightings</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog">
            <Card>
              <CardContent className="p-4">
                <CatalogStagingPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mantas">
            <Card>
              <CardContent className="p-4">
                <UniversalCsvUpdateTool
                  table="mantas"
                  primaryKey="pk_manta_id"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sightings">
            <Card>
              <CardContent className="p-4">
                📍 Sightings import UI coming soon
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos">
            <Card>
              <CardContent className="p-4">
                📷 Photos import UI coming soon
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
