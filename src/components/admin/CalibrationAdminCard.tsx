import { Link } from "react-router-dom";

export function CalibrationAdminCard(){
  return (
    <div className="rounded-lg border bg-white shadow-sm p-4">
      <div className="text-base font-medium mb-2">Calibration</div>
      <p className="text-sm text-slate-600 mb-3">
        Create a camera/laser calibration session and evaluate error.
      </p>
      <Link to="/admin/calibration/new" className="text-sky-700 underline text-sm">
        Start new calibration
      </Link>
    </div>
  );
}
export default CalibrationAdminCard;
