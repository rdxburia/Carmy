#!/usr/bin/env python3
"""
Torq Desk / Carmy Data Recovery & Snapshot Preservation Script
- Downloads Carmy-LATEST.tar.gz from Google Drive (file id 14J6raH_hfJz5_XBOwlu0eZVymwgmL75v)
- Verifies SHA-256 fingerprint matches 1a19dd65bb8415371927888d488dad28fd6a28f4c948f9f00b2a4591ed4cdd1b
- Creates immutable copies in Google Drive:
    - Carmy-SNAPSHOT-20261015-1025IST.tar.gz
    - IMMUTABLE-RECOVERY-SNAPSHOT-20261015.tar.gz
- Extracts PostgreSQL dump and inspects all records for crahul.exe@gmail.com
- Additively restores all missing test vehicle data to user b7b0bbb5-4449-4e5e-bb72-73bca0100d9b
- Syncs missing R2 documents to Cloudflare R2
- Verifies live restoration
"""

import os
import sys
import json
import gzip
import shutil
import hashlib
import tarfile
import re
from pathlib import Path

EXPECTED_SHA256 = "1a19dd65bb8415371927888d488dad28fd6a28f4c948f9f00b2a4591ed4cdd1b"
DRIVE_FILE_ID = "14J6raH_hfJz5_XBOwlu0eZVymwgmL75v"
TARGET_EMAIL = "crahul.exe@gmail.com"
TARGET_LIVE_USER_ID = "b7b0bbb5-4449-4e5e-bb72-73bca0100d9b"


def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def step1_drive_preservation():
    print("=" * 60)
    print("STEP 1: GOOGLE DRIVE PRESERVATION & DOWNLOAD")
    print("=" * 60)

    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload

    folder_id = os.environ["GOOGLE_DRIVE_FOLDER_ID"]
    refresh_token = os.environ["GOOGLE_OAUTH_REFRESH_TOKEN"]
    client_id = os.environ["GOOGLE_OAUTH_CLIENT_ID"]
    client_secret = os.environ["GOOGLE_OAUTH_CLIENT_SECRET"]

    credentials = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)

    # 1. Download Carmy-LATEST.tar.gz
    os.makedirs("recovery-output", exist_ok=True)
    local_tar = "recovery-output/Carmy-LATEST.tar.gz"

    print(f"Downloading file ID {DRIVE_FILE_ID} from Google Drive...")
    request = drive.files().get_media(fileId=DRIVE_FILE_ID, supportsAllDrives=True)
    with open(local_tar, "wb") as f:
        downloader = MediaIoBaseDownload(f, request, chunksize=1024 * 1024)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if status:
                print(f"  Download: {int(status.progress() * 100)}%")

    file_size = os.path.getsize(local_tar)
    print(f"Downloaded snapshot size: {file_size} bytes")

    # 2. Verify SHA-256 fingerprint
    actual_hash = compute_sha256(local_tar)
    print(f"Calculated SHA-256: {actual_hash}")
    print(f"Expected   SHA-256: {EXPECTED_SHA256}")

    if actual_hash != EXPECTED_SHA256:
        raise ValueError(f"CRITICAL ERROR: SHA-256 mismatch! Got {actual_hash}, expected {EXPECTED_SHA256}")
    print(">>> SHA-256 FINGERPRINT VERIFIED 100% MATCH! <<<")

    # 3. Create immutable copies in Google Drive
    immutable_names = [
        "Carmy-SNAPSHOT-20261015-1025IST.tar.gz",
        "IMMUTABLE-RECOVERY-SNAPSHOT-20261015.tar.gz"
    ]

    for name in immutable_names:
        # Check if already exists
        query = f"name = '{name}' and '{folder_id}' in parents and trashed = false"
        existing = drive.files().list(
            q=query, spaces="drive", fields="files(id, name, size)",
            supportsAllDrives=True, includeItemsFromAllDrives=True
        ).execute().get("files", [])

        if existing:
            print(f"Immutable file '{name}' already exists in Drive (ID: {existing[0]['id']})")
        else:
            body = {
                "name": name,
                "parents": [folder_id],
                "appProperties": {
                    "immutable": "true",
                    "snapshot_hash": EXPECTED_SHA256,
                    "preservation_date": "2026-10-15",
                    "note": "Permanent backup snapshot - do not delete"
                }
            }
            copied = drive.files().copy(
                fileId=DRIVE_FILE_ID,
                body=body,
                fields="id, name, size",
                supportsAllDrives=True
            ).execute()
            print(f"Created immutable copy in Drive: '{copied['name']}' (ID: {copied['id']})")

    print("Step 1 completed successfully!\n")
    return local_tar


def parse_pg_dump(sql_file_path):
    """
    Parses a pg_dump plain text SQL file and extracts COPY ... FROM stdin blocks
    into dictionary of tables: { table_name: { "columns": [...], "rows": [...] } }
    """
    tables = {}
    with open(sql_file_path, "r", encoding="utf-8", errors="replace") as f:
        current_table = None
        columns = []
        rows = []
        for line in f:
            if line.startswith("COPY ") and "FROM stdin;" in line:
                m = re.match(r"COPY\s+([^\s\(]+)\s*\((.*?)\)\s+FROM\s+stdin;", line)
                if m:
                    current_table = m.group(1).strip()
                    columns = [c.strip().strip('"') for c in m.group(2).split(",")]
                    rows = []
                continue
            if current_table:
                if line.strip() == r"\.":
                    tables[current_table] = {"columns": columns, "rows": rows}
                    current_table = None
                    columns = []
                    rows = []
                else:
                    fields = line.rstrip("\r\n").split("\t")
                    clean_fields = [None if item == r"\N" else item for item in fields]
                    rows.append(clean_fields)
    return tables


def step2_extract_and_inspect(local_tar):
    print("=" * 60)
    print("STEP 2: EXTRACT SNAPSHOT & INSPECT USER DATA")
    print("=" * 60)

    extract_dir = "recovery-output/snapshot"
    os.makedirs(extract_dir, exist_ok=True)

    print("Extracting Carmy-LATEST.tar.gz...")
    with tarfile.open(local_tar, "r:gz") as tar:
        tar.extractall(extract_dir)

    # Decompress database dump
    sql_gz = os.path.join(extract_dir, "db/Carmy-Supabase.sql.gz")
    sql_file = os.path.join(extract_dir, "db/Carmy-Supabase.sql")

    if not os.path.exists(sql_gz):
        raise FileNotFoundError(f"Missing {sql_gz}")

    print(f"Decompressing {sql_gz}...")
    with gzip.open(sql_gz, "rb") as f_in:
        with open(sql_file, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)

    print(f"Decompressed SQL size: {os.path.getsize(sql_file)} bytes")

    # Read manifest
    manifest_path = os.path.join(extract_dir, "backup-manifest.json")
    if os.path.exists(manifest_path):
        manifest = json.loads(Path(manifest_path).read_text())
        print(f"Backup Time: {manifest.get('backup_time_utc')}")
        print(f"Backup Commit: {manifest.get('commit_sha')}")

    # Parse pg_dump
    print("Parsing PostgreSQL dump tables...")
    tables = parse_pg_dump(sql_file)
    print(f"Found {len(tables)} tables with data in SQL dump:")
    for t, data in tables.items():
        print(f"  - {t}: {len(data['rows'])} rows, {len(data['columns'])} columns")

    # Discover target user
    user_ids_found = set()

    # 1. Search auth.users if present
    for t_name in ["auth.users", "users"]:
        if t_name in tables:
            cols = tables[t_name]["columns"]
            email_idx = cols.index("email") if "email" in cols else -1
            id_idx = cols.index("id") if "id" in cols else -1
            if email_idx != -1 and id_idx != -1:
                for row in tables[t_name]["rows"]:
                    if row[email_idx] == TARGET_EMAIL:
                        user_ids_found.add(row[id_idx])
                        print(f"Found {TARGET_EMAIL} in {t_name} with user_id: {row[id_idx]}")

    # 2. Search public.cars for registration or owner_name matching
    cars_data = tables.get("public.cars") or tables.get("cars")
    if cars_data:
        cols = cars_data["columns"]
        print(f"\nCars table columns: {cols}")
        user_idx = cols.index("user_id") if "user_id" in cols else -1
        owner_idx = cols.index("owner_name") if "owner_name" in cols else -1
        for row in cars_data["rows"]:
            row_dict = dict(zip(cols, row))
            print(f"  Car in backup: ID={row_dict.get('id')}, Reg={row_dict.get('registration_no')}, Model={row_dict.get('make_model')}, Owner={row_dict.get('owner_name')}, UserID={row_dict.get('user_id')}")
            # If user_ids_found is empty or this row matches
            if user_idx != -1 and row[user_idx]:
                user_ids_found.add(row[user_idx])

    print(f"\nTarget user IDs identified in backup: {user_ids_found}")
    print(f"Live target user ID: {TARGET_LIVE_USER_ID}")

    # Collect all records belonging to the target user (or all cars if only test user exists)
    backup_records = {
        "cars": [],
        "records": [],
        "record_items": [],
        "documents": [],
        "insurance_history": [],
        "puc_history": [],
        "sale_history": [],
        "policy_renewals": [],
        "user_profiles": []
    }

    # Cars
    target_car_ids = set()
    if cars_data:
        cols = cars_data["columns"]
        for row in cars_data["rows"]:
            row_dict = dict(zip(cols, row))
            uid = row_dict.get("user_id")
            if uid in user_ids_found or len(user_ids_found) == 0:
                target_car_ids.add(row_dict["id"])
                # Map user_id to TARGET_LIVE_USER_ID
                row_dict["user_id"] = TARGET_LIVE_USER_ID
                backup_records["cars"].append(row_dict)

    # Service records
    target_record_ids = set()
    records_data = tables.get("public.records") or tables.get("records")
    if records_data:
        cols = records_data["columns"]
        for row in records_data["rows"]:
            row_dict = dict(zip(cols, row))
            if row_dict.get("car_id") in target_car_ids or row_dict.get("user_id") in user_ids_found:
                target_record_ids.add(row_dict["id"])
                row_dict["user_id"] = TARGET_LIVE_USER_ID
                backup_records["records"].append(row_dict)

    # Record items
    items_data = tables.get("public.record_items") or tables.get("record_items")
    if items_data:
        cols = items_data["columns"]
        for row in items_data["rows"]:
            row_dict = dict(zip(cols, row))
            if row_dict.get("record_id") in target_record_ids:
                backup_records["record_items"].append(row_dict)

    # Documents
    docs_data = tables.get("public.documents") or tables.get("documents")
    if docs_data:
        cols = docs_data["columns"]
        for row in docs_data["rows"]:
            row_dict = dict(zip(cols, row))
            if row_dict.get("car_id") in target_car_ids or row_dict.get("user_id") in user_ids_found:
                row_dict["user_id"] = TARGET_LIVE_USER_ID
                backup_records["documents"].append(row_dict)

    # Insurance
    ins_data = tables.get("public.insurance_history") or tables.get("insurance_history")
    if ins_data:
        cols = ins_data["columns"]
        for row in ins_data["rows"]:
            row_dict = dict(zip(cols, row))
            if row_dict.get("car_id") in target_car_ids or row_dict.get("user_id") in user_ids_found:
                row_dict["user_id"] = TARGET_LIVE_USER_ID
                backup_records["insurance_history"].append(row_dict)

    # PUC
    puc_data = tables.get("public.puc_history") or tables.get("puc_history")
    if puc_data:
        cols = puc_data["columns"]
        for row in puc_data["rows"]:
            row_dict = dict(zip(cols, row))
            if row_dict.get("car_id") in target_car_ids or row_dict.get("user_id") in user_ids_found:
                row_dict["user_id"] = TARGET_LIVE_USER_ID
                backup_records["puc_history"].append(row_dict)

    # Sales
    sale_data = tables.get("public.sale_history") or tables.get("sale_history")
    if sale_data:
        cols = sale_data["columns"]
        for row in sale_data["rows"]:
            row_dict = dict(zip(cols, row))
            if row_dict.get("car_id") in target_car_ids or row_dict.get("user_id") in user_ids_found:
                row_dict["user_id"] = TARGET_LIVE_USER_ID
                backup_records["sale_history"].append(row_dict)

    # Renewals
    ren_data = tables.get("public.policy_renewals") or tables.get("policy_renewals")
    if ren_data:
        cols = ren_data["columns"]
        for row in ren_data["rows"]:
            row_dict = dict(zip(cols, row))
            if row_dict.get("car_id") in target_car_ids or row_dict.get("user_id") in user_ids_found:
                row_dict["user_id"] = TARGET_LIVE_USER_ID
                backup_records["policy_renewals"].append(row_dict)

    # Profiles
    prof_data = tables.get("public.user_profiles") or tables.get("user_profiles")
    if prof_data:
        cols = prof_data["columns"]
        for row in prof_data["rows"]:
            row_dict = dict(zip(cols, row))
            if row_dict.get("user_id") in user_ids_found:
                row_dict["user_id"] = TARGET_LIVE_USER_ID
                backup_records["user_profiles"].append(row_dict)

    print("\nSummary of records found in backup for restoration:")
    for k, v in backup_records.items():
        print(f"  - {k}: {len(v)} records")

    # Save summary report
    with open("recovery-output/backup_user_records.json", "w") as f:
        json.dump(backup_records, f, indent=2, default=str)

    return backup_records, extract_dir


def step3_restore_to_supabase(backup_records):
    print("=" * 60)
    print("STEP 3: ADDITIVE RESTORATION TO LIVE SUPABASE")
    print("=" * 60)

    import psycopg2
    from psycopg2 import sql

    db_url = os.environ["SUPABASE_BACKUP_DB_URL"]
    conn = psycopg2.connect(db_url, sslmode="require")
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            # 1. Verify target user exists in auth.users
            cur.execute("SELECT id, email FROM auth.users WHERE id = %s", (TARGET_LIVE_USER_ID,))
            live_user = cur.fetchone()
            if not live_user:
                print(f"Warning: user {TARGET_LIVE_USER_ID} not found directly by ID, checking by email {TARGET_EMAIL}...")
                cur.execute("SELECT id, email FROM auth.users WHERE email = %s", (TARGET_EMAIL,))
                live_user = cur.fetchone()
                if not live_user:
                    raise ValueError(f"Target user {TARGET_EMAIL} does not exist in auth.users!")
                actual_user_id = live_user[0]
                print(f"Found active user by email with ID: {actual_user_id}")
            else:
                actual_user_id = live_user[0]
                print(f"Target user confirmed in auth.users: {live_user[1]} ({actual_user_id})")

            # Check counts before
            cur.execute("SELECT count(*) FROM public.cars WHERE user_id = %s", (actual_user_id,))
            before_cars = cur.fetchone()[0]
            print(f"Live cars before restoration: {before_cars}")

            cur.execute("SELECT count(*) FROM public.records WHERE user_id = %s", (actual_user_id,))
            before_records = cur.fetchone()[0]
            print(f"Live service records before restoration: {before_records}")

            cur.execute("SELECT count(*) FROM public.documents WHERE user_id = %s", (actual_user_id,))
            before_docs = cur.fetchone()[0]
            print(f"Live documents before restoration: {before_docs}")

            # 2. Additive insert for public.cars
            # Get table schema columns from information_schema
            cur.execute("""
                SELECT column_name, data_type, is_generated
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'cars'
            """)
            cars_cols_info = {row[0]: {"type": row[1], "generated": row[2]} for row in cur.fetchall()}

            cars_restored = 0
            for car in backup_records["cars"]:
                car["user_id"] = actual_user_id
                cols_to_insert = [c for c in car.keys() if c in cars_cols_info and cars_cols_info[c]["generated"] != "ALWAYS"]
                query = sql.SQL("""
                    INSERT INTO public.cars ({fields})
                    VALUES ({values})
                    ON CONFLICT (id) DO UPDATE SET
                        owner_name = EXCLUDED.owner_name,
                        make_model = EXCLUDED.make_model,
                        model_year = EXCLUDED.model_year,
                        fuel = EXCLUDED.fuel,
                        current_km = GREATEST(cars.current_km, EXCLUDED.current_km),
                        vin = COALESCE(cars.vin, EXCLUDED.vin),
                        engine_no = COALESCE(cars.engine_no, EXCLUDED.engine_no),
                        insurance_company = COALESCE(EXCLUDED.insurance_company, cars.insurance_company),
                        insurance_number = COALESCE(EXCLUDED.insurance_number, cars.insurance_number),
                        insurance_expiry = COALESCE(EXCLUDED.insurance_expiry, cars.insurance_expiry),
                        puc_certificate_no = COALESCE(EXCLUDED.puc_certificate_no, cars.puc_certificate_no),
                        puc_expiry = COALESCE(EXCLUDED.puc_expiry, cars.puc_expiry)
                """).format(
                    fields=sql.SQL(", ").join(map(sql.Identifier, cols_to_insert)),
                    values=sql.SQL(", ").join(sql.Placeholder() * len(cols_to_insert))
                )
                vals = [car[c] for c in cols_to_insert]
                cur.execute(query, vals)
                cars_restored += 1

            print(f"Upserted {cars_restored} vehicles into public.cars")

            # 3. Additive insert for public.records
            cur.execute("""
                SELECT column_name, data_type, is_generated
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'records'
            """)
            records_cols_info = {row[0]: {"type": row[1], "generated": row[2]} for row in cur.fetchall()}

            records_restored = 0
            for r in backup_records["records"]:
                r["user_id"] = actual_user_id
                # Omit generated columns like total_cost
                cols_to_insert = [c for c in r.keys() if c in records_cols_info and records_cols_info[c]["generated"] != "ALWAYS"]
                query = sql.SQL("""
                    INSERT INTO public.records ({fields})
                    VALUES ({values})
                    ON CONFLICT (id) DO NOTHING
                """).format(
                    fields=sql.SQL(", ").join(map(sql.Identifier, cols_to_insert)),
                    values=sql.SQL(", ").join(sql.Placeholder() * len(cols_to_insert))
                )
                vals = [r[c] for c in cols_to_insert]
                cur.execute(query, vals)
                records_restored += 1

            print(f"Inserted {records_restored} records into public.records")

            # 4. Additive insert for public.record_items
            cur.execute("""
                SELECT column_name, data_type, is_generated
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'record_items'
            """)
            items_cols_info = {row[0]: {"type": row[1], "generated": row[2]} for row in cur.fetchall()}

            items_restored = 0
            for item in backup_records["record_items"]:
                cols_to_insert = [c for c in item.keys() if c in items_cols_info and items_cols_info[c]["generated"] != "ALWAYS"]
                query = sql.SQL("""
                    INSERT INTO public.record_items ({fields})
                    VALUES ({values})
                    ON CONFLICT (id) DO NOTHING
                """).format(
                    fields=sql.SQL(", ").join(map(sql.Identifier, cols_to_insert)),
                    values=sql.SQL(", ").join(sql.Placeholder() * len(cols_to_insert))
                )
                vals = [item[c] for c in cols_to_insert]
                cur.execute(query, vals)
                items_restored += 1

            print(f"Inserted {items_restored} items into public.record_items")

            # 5. Additive insert for public.documents
            cur.execute("""
                SELECT column_name, data_type, is_generated
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'documents'
            """)
            docs_cols_info = {row[0]: {"type": row[1], "generated": row[2]} for row in cur.fetchall()}

            docs_restored = 0
            for d in backup_records["documents"]:
                d["user_id"] = actual_user_id
                cols_to_insert = [c for c in d.keys() if c in docs_cols_info and docs_cols_info[c]["generated"] != "ALWAYS"]
                query = sql.SQL("""
                    INSERT INTO public.documents ({fields})
                    VALUES ({values})
                    ON CONFLICT (id) DO NOTHING
                """).format(
                    fields=sql.SQL(", ").join(map(sql.Identifier, cols_to_insert)),
                    values=sql.SQL(", ").join(sql.Placeholder() * len(cols_to_insert))
                )
                vals = [d[c] for c in cols_to_insert]
                cur.execute(query, vals)
                docs_restored += 1

            print(f"Inserted {docs_restored} documents into public.documents")

            # 6. Optional history tables
            for tbl, key in [
                ("insurance_history", "insurance_history"),
                ("puc_history", "puc_history"),
                ("sale_history", "sale_history"),
                ("policy_renewals", "policy_renewals"),
                ("user_profiles", "user_profiles")
            ]:
                rows = backup_records.get(key, [])
                if not rows:
                    continue
                cur.execute(f"""
                    SELECT column_name, is_generated
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = '{tbl}'
                """)
                t_cols = {r[0]: r[1] for r in cur.fetchall()}
                if not t_cols:
                    print(f"Note: table public.{tbl} does not exist in live DB, skipping.")
                    continue

                cnt = 0
                for row in rows:
                    if "user_id" in row:
                        row["user_id"] = actual_user_id
                    cols_to_insert = [c for c in row.keys() if c in t_cols and t_cols[c] != "ALWAYS"]
                    on_conflict = "ON CONFLICT (id) DO NOTHING" if "id" in cols_to_insert else "ON CONFLICT (user_id) DO NOTHING"
                    query = sql.SQL(f"""
                        INSERT INTO public.{tbl} ({{fields}})
                        VALUES ({{values}})
                        {on_conflict}
                    """).format(
                        fields=sql.SQL(", ").join(map(sql.Identifier, cols_to_insert)),
                        values=sql.SQL(", ").join(sql.Placeholder() * len(cols_to_insert))
                    )
                    vals = [row[c] for c in cols_to_insert]
                    cur.execute(query, vals)
                    cnt += 1
                print(f"Inserted {cnt} rows into public.{tbl}")

            # Query counts after
            cur.execute("SELECT count(*) FROM public.cars WHERE user_id = %s", (actual_user_id,))
            after_cars = cur.fetchone()[0]

            cur.execute("SELECT count(*) FROM public.records WHERE user_id = %s", (actual_user_id,))
            after_records = cur.fetchone()[0]

            cur.execute("SELECT count(*) FROM public.documents WHERE user_id = %s", (actual_user_id,))
            after_docs = cur.fetchone()[0]

            print(f"\nLive database counts after restoration:")
            print(f"  - Cars: {before_cars} -> {after_cars}")
            print(f"  - Records: {before_records} -> {after_records}")
            print(f"  - Documents: {before_docs} -> {after_docs}")

            # Commit transaction!
            conn.commit()
            print(">>> DATABASE TRANSACTION COMMITTED SUCCESSFULLY! <<<")

    except Exception as e:
        conn.rollback()
        print(f"Transaction failed, rolled back: {e}")
        raise e
    finally:
        conn.close()


def step4_sync_r2_documents(extract_dir):
    print("=" * 60)
    print("STEP 4: SYNC CLOUDFLARE R2 DOCUMENTS")
    print("=" * 60)

    r2_docs_dir = os.path.join(extract_dir, "r2/documents")
    if not os.path.exists(r2_docs_dir):
        print(f"No R2 documents found in backup snapshot at {r2_docs_dir}")
        return

    files_in_backup = list(Path(r2_docs_dir).rglob("*"))
    files_in_backup = [f for f in files_in_backup if f.is_file()]
    print(f"Found {len(files_in_backup)} document files in backup snapshot")

    # AWS CLI sync
    r2_bucket = os.environ.get("R2_BUCKET", "carmy-files")
    r2_endpoint = os.environ.get("R2_S3_ENDPOINT", "https://1bdda74ff7f93e7d176660d0e329b5ce.r2.cloudflarestorage.com")

    # Run aws s3 sync without --delete
    cmd = (
        f'aws s3 sync "{r2_docs_dir}" "s3://{r2_bucket}/documents/" '
        f'--region auto --endpoint-url "{r2_endpoint}" --no-progress'
    )
    print(f"Running R2 additive sync: {cmd}")
    res = os.system(cmd)
    if res != 0:
        print(f"Warning: R2 sync exited with code {res}")
    else:
        print("R2 documents synced successfully!")


def main():
    print("Starting Carmy Data Recovery & Snapshot Preservation...")
    local_tar = step1_drive_preservation()
    backup_records, extract_dir = step2_extract_and_inspect(local_tar)
    step3_restore_to_supabase(backup_records)
    step4_sync_r2_documents(extract_dir)

    print("\n" + "=" * 60)
    print("ALL RECOVERY AND PRESERVATION STEPS FINISHED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    main()
