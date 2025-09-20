# backfill_photo_population.py

import os
from dotenv import load_dotenv
from supabase import create_client
from time import sleep

# Load .env variables
load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

BATCH_SIZE = 1000
offset = 0
updated_count = 0
skipped_count = 0

print("🔁 Backfilling population into photos table...")

while True:
    print(f"\n📦 Fetching batch starting at offset {offset}...")

    try:
        # ✅ FIXED: Only two arguments allowed
        result = (
            supabase
            .table("photos")
            .select("pk_photo_id, fk_sighting_id, population")
            .is_("population", None)
            .limit(BATCH_SIZE)
            .offset(offset)
            .execute()
        )
    except Exception as e:
        print(f"❌ Error fetching photos: {e}")
        break

    photos = result.data
    if not photos:
        print("\n✅ All applicable photos processed.")
        break

    updates = []

    for photo in photos:
        photo_id = photo.get("pk_photo_id")
        sighting_id = photo.get("fk_sighting_id")

        if not sighting_id:
            skipped_count += 1
            continue

        try:
            sighting_result = (
                supabase
                .table("sightings")
                .select("population")
                .eq("pk_sighting_id", sighting_id)
                .limit(1)
                .execute()
            )
            sighting_data = sighting_result.data[0] if sighting_result.data else None
            population = sighting_data["population"] if sighting_data else None

            if population:
                updates.append({
                    "pk_photo_id": photo_id,
                    "population": population
                })
        except Exception as e:
            print(f"⚠️ Error fetching sighting for photo {photo_id}: {e}")
            skipped_count += 1

    if updates:
        try:
            supabase.table("photos").upsert(updates, on_conflict="pk_photo_id").execute()
            updated_count += len(updates)
            for update in updates:
                print(f"✅ Updated photo {update['pk_photo_id']} → {update['population']}")
        except Exception as e:
            print(f"❌ Error updating batch: {e}")

    offset += BATCH_SIZE
    sleep(0.5)

print(f"\n🎉 Done. {updated_count} photos updated, {skipped_count} skipped.")
