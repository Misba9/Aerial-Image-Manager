#!/usr/bin/env python3
"""
Write GPS EXIF data to JPEG images from a CSV file.

Input JSON via argv[1]:
{
  "folder": "...",
  "csv": "...",
  "recursive": bool
}

CSV columns (positional, no header required):
col0: image name (required)
col1: latitude (required)
col2: longitude (required)
col3: altitude (optional)
col4: yaw/heading (optional)
col7: pitch (optional)
col8: roll (optional)

Output JSON:
{
  "processed": <int>,   # CSV rows processed
  "updated": <int>,     # images written
  "skipped": <int>,     # rows skipped (missing coords, not found, read-only, errors)
  "errors": [ { "row": <int>, "reason": <string> } ]
}
"""

import csv
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def parse_args() -> Dict[str, Any]:
    if len(sys.argv) < 2:
        return {}
    try:
        return json.loads(sys.argv[1])
    except Exception:
        return {}


def load_piexif():
    try:
        import piexif  # type: ignore
        return piexif
    except ImportError:
        return None


def to_rational(dec: float) -> Tuple[Tuple[int, int], Tuple[int, int], Tuple[int, int]]:
    if dec is None:
        return (0, 1), (0, 1), (0, 1)
    dec = abs(dec)
    deg = int(dec)
    minutes_full = (dec - deg) * 60
    minutes = int(minutes_full)
    seconds = round((minutes_full - minutes) * 60 * 10000)
    return (deg, 1), (minutes, 1), (seconds, 10000)


def build_gps_ifd(lat: float, lon: float, alt: Optional[float]) -> Dict[int, Any]:
    import piexif

    gps_ifd: Dict[int, Any] = {}
    lat_ref = "N" if lat >= 0 else "S"
    lon_ref = "E" if lon >= 0 else "W"
    lat_dms = to_rational(lat)
    lon_dms = to_rational(lon)
    gps_ifd[piexif.GPSIFD.GPSLatitudeRef] = lat_ref
    gps_ifd[piexif.GPSIFD.GPSLatitude] = lat_dms
    gps_ifd[piexif.GPSIFD.GPSLongitudeRef] = lon_ref
    gps_ifd[piexif.GPSIFD.GPSLongitude] = lon_dms
    if alt is not None:
        alt_val = abs(float(alt))
        gps_ifd[piexif.GPSIFD.GPSAltitude] = (int(alt_val * 100), 100)
        gps_ifd[piexif.GPSIFD.GPSAltitudeRef] = 0 if alt >= 0 else 1
    return gps_ifd


def load_csv(csv_path: Path) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for idx, row in enumerate(reader, start=1):
            if not row or all((cell or "").strip() == "" for cell in row):
                continue
            img_name = (row[0] or "").strip()
            lat_raw = (row[1] or "").strip() if len(row) > 1 else ""
            lon_raw = (row[2] or "").strip() if len(row) > 2 else ""
            alt_raw = (row[3] or "").strip() if len(row) > 3 else ""
            yaw_raw = (row[4] or "").strip() if len(row) > 4 else ""
            pitch_raw = (row[7] or "").strip() if len(row) > 7 else ""
            roll_raw = (row[8] or "").strip() if len(row) > 8 else ""
            # Skip a header row silently if detected
            if idx == 1 and lat_raw.lower().startswith("lat") and lon_raw.lower().startswith("lon"):
                continue
            rows.append(
                {
                    "_row": idx,
                    "image_name": img_name,
                    "latitude": lat_raw,
                    "longitude": lon_raw,
                    "altitude": alt_raw,
                    "yaw": yaw_raw,
                    "pitch": pitch_raw,
                    "roll": roll_raw,
                }
            )
    return rows, errors


def normalize_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        text = str(value).strip().lstrip("\ufeff")
        if text == "":
            return None
        return float(text)
    except Exception:
        return None


def iter_images(folder: Path, recursive: bool) -> List[Path]:
    pattern = "**/*" if recursive else "*"
    images: List[Path] = []
    for path in folder.glob(pattern):
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg"}:
            images.append(path)
    return images


def write_gps_to_image(path: Path, piexif_mod, lat: float, lon: float, alt: Optional[float]) -> Tuple[bool, Optional[str]]:
    try:
        exif_dict = piexif_mod.load(str(path))
    except Exception:
        exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    try:
        gps_ifd = build_gps_ifd(lat, lon, alt)
        exif_dict["GPS"] = gps_ifd
        exif_bytes = piexif_mod.dump(exif_dict)
        piexif_mod.insert(exif_bytes, str(path))
        return True, None
    except Exception:
        return False, "piexif insert failed"


def main():
    payload = parse_args()
    folder = payload.get("folder")
    csv_path = payload.get("csv")
    recursive = bool(payload.get("recursive", True))

    if not folder or not csv_path:
        print(json.dumps({"error": "Folder and csv are required", "processed": 0, "updated": 0, "skipped": 0, "errors": []}))
        return

    piexif_mod = load_piexif()
    if piexif_mod is None:
        print(json.dumps({"error": "piexif is required for write_gps", "processed": 0, "updated": 0, "skipped": 0, "errors": []}))
        return

    folder_path = Path(folder)
    if not folder_path.exists() or not folder_path.is_dir():
        print(json.dumps({"error": "Folder not found", "processed": 0, "updated": 0, "skipped": 0, "errors": []}))
        return

    csv_file = Path(csv_path)
    if not csv_file.exists() or not csv_file.is_file():
        print(json.dumps({"error": "CSV not found", "processed": 0, "updated": 0, "skipped": 0, "errors": []}))
        return

    load_errors: List[Dict[str, Any]] = []
    try:
        rows, load_errors = load_csv(csv_file)
    except Exception as exc:
        print(json.dumps({"error": f"Failed to read CSV: {exc}", "processed": 0, "updated": 0, "skipped": 0, "errors": []}))
        return

    images = iter_images(folder_path, recursive)
    image_map = {p.name.lower(): p for p in images}

    updated = 0
    skipped = 0
    total_rows = len(rows)
    errors: List[Dict[str, Any]] = list(load_errors)

    for row in rows:
        name_raw = (row.get("image_name") or "").strip()
        name = name_raw.lower()
        lat_raw = (row.get("latitude") or "").strip()
        lon_raw = (row.get("longitude") or "").strip()
        alt_raw = (row.get("altitude") or "").strip()
        yaw_raw = (row.get("yaw") or "").strip()
        pitch_raw = (row.get("pitch") or "").strip()
        roll_raw = (row.get("roll") or "").strip()

        # Name check
        if name == "":
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Missing image name"})
            continue

        # Presence check for lat/lon
        if lat_raw == "":
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Invalid latitude"})
            continue
        if lon_raw == "":
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Invalid longitude"})
            continue

        # Numeric parse
        lat = normalize_float(lat_raw)
        lon = normalize_float(lon_raw)
        alt = normalize_float(alt_raw) if alt_raw != "" else None
        # Optional orientation; parse but do not warn on invalid/missing
        _yaw = normalize_float(yaw_raw) if yaw_raw else None
        _pitch = normalize_float(pitch_raw) if pitch_raw else None
        _roll = normalize_float(roll_raw) if roll_raw else None

        if lat is None:
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Invalid latitude"})
            continue
        if lon is None:
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Invalid longitude"})
            continue
        img_path = image_map.get(name)
        if not img_path:
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": f"Image not found for {name_raw}"})
            continue
        if not os.access(img_path, os.W_OK):
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": f"Read-only file skipped: {img_path}"})
            continue
        success, err = write_gps_to_image(img_path, piexif_mod, lat, lon, alt)
        if success:
            updated += 1
        else:
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": f"Failed to write GPS for {img_path}: {err or 'unknown error'}"})

    result = {
        "processed": total_rows,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
    try:
        sys.stdout.flush()
    except Exception:
        pass
    sys.exit(0)

