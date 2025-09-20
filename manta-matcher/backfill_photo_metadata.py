# backfill_photo_metadata.py

import os
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE credentials.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Define population groups
ISLAND_TO_POPULATION = {
    "Big Island": "Big Island",
    "Maui": "Maui Nui",
    "Molokai": "Maui Nui",
    "Lanai": "Maui Nui",
    "Kahoolawe": "Maui Nui",
    "Oahu": "Oahu",
    "Kauai": "Kauai",
    "Niihau": "Kauai",
}

print("🧠 Backfilling sightings.population...")

# Fetch all sightings with island field
try:
    sightings_response = supabase.table("sightings").select("pk_sighting_id, island").execute()
    sightings = sightings_response.data
except Exception as e:
    print(f"❌ Failed to fetch sightings: {e}")
    exit(1)

# Loop and update population
for s in sightings:
    sighting_id = s.get("pk_sighting_id")
    island = s.get("island")
    population = ISLAND_TO_POPULATION.get(island)

    if not population:
        print(f"⚠️ Unknown island '{island}' for sighting {sighting_id}")
        continue

    try:
        supabase.table("sightings").update({
            "population": population
        }).eq("pk_sighting_id", sighting_id).execute()
        print(f"✅ Updated sighting {sighting_id} → {population}")
    except Exception as e:
        print(f"❌ Failed to update sighting {sighting_id}: {e}")

print("🎉 Done.")
