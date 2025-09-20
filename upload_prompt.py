from supabase import create_client, Client

# === Supabase Config ===
SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "JWT_REDACTED"

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

