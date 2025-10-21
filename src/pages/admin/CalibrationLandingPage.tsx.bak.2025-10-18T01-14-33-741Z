import { Link } from "react-router-dom";

export default function CalibrationLandingPage(){
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Calibration</h1>
        <p className="text-sm text-slate-600">Create a camera/laser calibration session and evaluate error across photos.</p>
      </div>
      <div className="rounded-lg border p-4 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Start a new session</div>
            <p className="text-sm text-slate-600">Set session scale (m), then add photos to measure.</p>
          </div>
          <Link to="/admin/calibration/new" className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50">
            New Calibration
          </Link>
        </div>
      </div>
    </div>
  );
}
