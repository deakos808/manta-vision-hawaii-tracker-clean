import { useMemo } from 'react';
import { Pencil, AlertCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

type ParsedImage = {
  id: string;
  filename: string;
  metadata: {
    catalogId?: string;
    sightingId?: string;
    date?: string;
    island?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    ageClass?: string;
    gender?: string;
    size?: string;
    tag?: string;
  };
  errors?: string[];
};

interface DryRunPreviewTableProps {
  data: ParsedImage[];
  onEdit?: (id: string) => void;
  onApproveAll?: () => void;
}

const DryRunPreviewTable = ({ data, onEdit, onApproveAll }: DryRunPreviewTableProps) => {
  const hasErrors = useMemo(() => data.some(row => row.errors && row.errors.length > 0), [data]);

  return (
    <div className="border rounded-lg shadow-sm">
      <div className="flex justify-between items-center p-4 border-b">
        <h3 className="text-lg font-semibold">Dry Run Preview</h3>
        <Button variant="outline" onClick={onApproveAll} disabled={hasErrors}>
          Approve All
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filename</TableHead>
            <TableHead>Catalog ID</TableHead>
            <TableHead>Sighting ID</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Island</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Lat</TableHead>
            <TableHead>Lon</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Gender</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Tag</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map(row => (
            <TableRow key={row.id} className={row.errors?.length ? 'bg-red-50' : ''}>
              <TableCell>{row.filename}</TableCell>
              <TableCell>{row.metadata.catalogId || '-'}</TableCell>
              <TableCell>{row.metadata.sightingId || '-'}</TableCell>
              <TableCell>{row.metadata.date || '-'}</TableCell>
              <TableCell>{row.metadata.island || '-'}</TableCell>
              <TableCell>{row.metadata.location || '-'}</TableCell>
              <TableCell>{row.metadata.latitude ?? '-'}</TableCell>
              <TableCell>{row.metadata.longitude ?? '-'}</TableCell>
              <TableCell>{row.metadata.ageClass || '-'}</TableCell>
              <TableCell>{row.metadata.gender || '-'}</TableCell>
              <TableCell>{row.metadata.size || '-'}</TableCell>
              <TableCell>{row.metadata.tag || '-'}</TableCell>
              <TableCell>
                {row.errors?.length ? (
                  <div className="flex items-center text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {row.errors.join(', ')}
                  </div>
                ) : (
                  <span className="text-green-600">✓ Valid</span>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit?.(row.id)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default DryRunPreviewTable;
