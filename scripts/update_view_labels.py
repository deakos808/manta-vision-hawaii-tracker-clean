import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load credentials
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

ventral_ids = [6, 16, 26, 31, 45, 50, 105, 122, 305, 503, 505, 1665, 1892, 2141, 2250]
dorsal_ids = [75, 102, 108, 116, 174, 308, 490, 492, 494, 1108, 1163, 1454, 1455, 1708, 1984]
other_ids = [338, 368, 427, 513, 515, 521, 548, 553, 554, 630, 2330, 5072, 5073, 5224, 661]

def update_view(view_ids, label):
    result = supabase.table("photos").update({"view_label": label}).in_("pk_photo_id", view_ids).execute()
    print(f"{label.capitalize()} update:", result)

update_view(ventral_ids, "ventral")
update_view(dorsal_ids, "dorsal")
update_view(other_ids, "other")
