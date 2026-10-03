import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * The former universal updater accepted a service-role key in browser code.
 * Keep this component as a visible fail-closed placeholder until a trusted
 * server-side, allowlisted import workflow is approved and implemented.
 */
export default function UniversalCsvUpdateTool() {
  return (
    <Alert variant="destructive">
      <AlertTitle>Legacy CSV updater disabled</AlertTitle>
      <AlertDescription>
        This browser-side universal updater has been disabled for security. Use
        the reviewed staging import workflow instead; no privileged key is
        accepted or initialized in the client.
      </AlertDescription>
    </Alert>
  );
}
