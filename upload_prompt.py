from supabase import create_client, Client

# === Supabase Config ===
SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwd2V0ZW9zZGJnc29sbXZjbWhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njk4NzgyOSwiZXhwIjoyMDYyNTYzODI5fQ.z0CMeV4Sqyzpan-Sj3hVSr6xIXg380T7LXV70JMuFcs"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# === File Info ===
bucket_name = "project-files"  # Must already exist in Supabase
local_file_path = "hawaii-manta-tracker-prompt.md"
storage_path = "prompts/hawaii-manta-tracker-prompt.md"  # path inside the bucket

# === Upload ===
with open(local_file_path, "rb") as f:
    file_bytes = f.read()

res = supabase.storage.from_(bucket_name).upload(
    path=storage_path,
    file=file_bytes,
    file_options={"content-type": "text/markdown", "upsert": True}
)

print("✅ Upload complete:", res)

