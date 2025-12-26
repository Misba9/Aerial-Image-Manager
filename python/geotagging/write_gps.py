#!/usr/bin/env python3
"""
Write GPS EXIF data to JPEG images from a CSV file.

Input JSON via argv[1]:
{
  "folder": "...",
  "csv": "...",
  "recursive": bool
}

CSV columns (case-insensitive header supported; positional fallback):
col0: filename (required)
col1: latitude (required)
col2: longitude (required)
col3: altitude (optional)
col4: phi (optional)
col5: alpha (optional)
col6: kappa (optional)

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

ORIENTATION_JSON_KEY = "camera_orientation"
XMP_NAMESPACE = "http://shamal.tools/ns/cameraorientation/1.0/"


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
    header_map: Optional[Dict[str, int]] = None
    allowed_headers = {"filename", "image_name", "latitude", "longitude", "altitude", "phi", "alpha", "kappa"}
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for idx, row in enumerate(reader, start=1):
            if not row or all((cell or "").strip() == "" for cell in row):
                continue
            if header_map is None:
                lowered = [(cell or "").strip().lower() for cell in row]
                detected = {name: i for i, name in enumerate(lowered) if name in allowed_headers}
                # If this first non-empty row looks like a header, record mapping and continue
                if {"filename", "latitude", "longitude"}.issubset(detected.keys()) or {"image_name", "latitude", "longitude"}.issubset(detected.keys()):
                    header_map = detected
                    continue
                header_map = {}

            def pick(name: str, pos: int) -> str:
                if header_map:
                    idx = header_map.get(name)
                    if idx is not None and idx < len(row):
                        return (row[idx] or "").strip()
                return (row[pos] or "").strip() if len(row) > pos else ""

            img_name = pick("filename", 0) or pick("image_name", 0)
            lat_raw = pick("latitude", 1)
            lon_raw = pick("longitude", 2)
            alt_raw = pick("altitude", 3)
            phi_raw = pick("phi", 4)
            alpha_raw = pick("alpha", 5)
            kappa_raw = pick("kappa", 6)

            rows.append(
                {
                    "_row": idx,
                    "image_name": img_name,
                    "latitude": lat_raw,
                    "longitude": lon_raw,
                    "altitude": alt_raw,
                    "phi": phi_raw,
                    "alpha": alpha_raw,
                    "kappa": kappa_raw,
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


def decode_user_comment(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    if isinstance(raw, bytes):
        try:
            prefix = raw[:8]
            if prefix in {b"ASCII\x00\x00\x00", b"UNICODE\x00", b"UNICODE\x00"}:
                payload = raw[8:]
                try:
                    return payload.decode("utf-8", errors="ignore")
                except Exception:
                    try:
                        return payload.decode("utf-16", errors="ignore")
                    except Exception:
                        pass
            return raw.decode("utf-8", errors="ignore")
        except Exception:
            return None
    try:
        return str(raw)
    except Exception:
        return None


def format_orientation_json(phi: Optional[float], alpha: Optional[float], kappa: Optional[float]) -> Optional[str]:
    payload = {}
    if phi is not None:
        payload["phi"] = phi
    if alpha is not None:
        payload["alpha"] = alpha
    if kappa is not None:
        payload["kappa"] = kappa
    if not payload:
        return None
    return json.dumps(payload, separators=(",", ":"))


def encode_user_comment(text: str, piexif_mod) -> Any:
    try:
        # piexif.helper creates correctly-prefixed UserComment bytes
        return piexif_mod.helper.UserComment.dump(text)
    except Exception:
        return text.encode("utf-8", errors="ignore")


def apply_orientation(
    exif_dict: Dict[str, Any], piexif_mod, phi: Optional[float], alpha: Optional[float], kappa: Optional[float]
) -> None:
    comment = format_orientation_json(phi, alpha, kappa)
    if not comment:
        return
    existing = None
    try:
        existing = exif_dict.get("Exif", {}).get(piexif_mod.ExifIFD.UserComment)
    except Exception:
        existing = None
    # Always overwrite orientation blob to keep it current
    exif_dict.setdefault("Exif", {})[piexif_mod.ExifIFD.UserComment] = encode_user_comment(comment, piexif_mod)


def build_xmp_packet(phi: Optional[float], alpha: Optional[float], kappa: Optional[float]) -> Optional[str]:
    if phi is None and alpha is None and kappa is None:
        return None
    tmpl = f'''<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:sgco="{XMP_NAMESPACE}">
      {'' if phi is None else f'<sgco:Phi>{phi}</sgco:Phi>'}
      {'' if alpha is None else f'<sgco:Alpha>{alpha}</sgco:Alpha>'}
      {'' if kappa is None else f'<sgco:Kappa>{kappa}</sgco:Kappa>'}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>'''
    return tmpl


def write_gps_to_image(
    path: Path,
    piexif_mod,
    lat: float,
    lon: float,
    alt: Optional[float],
    orientation: Tuple[Optional[float], Optional[float], Optional[float]],
) -> Tuple[bool, Optional[str]]:
    try:
        exif_dict = piexif_mod.load(str(path))
    except Exception:
        exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    try:
        gps_ifd = build_gps_ifd(lat, lon, alt)
        exif_dict["GPS"] = gps_ifd
        phi, alpha, kappa = orientation
        apply_orientation(exif_dict, piexif_mod, phi, alpha, kappa)
        exif_bytes = piexif_mod.dump(exif_dict)
        piexif_mod.insert(exif_bytes, str(path))
        # Preferred: write XMP sidecar with custom namespace
        xmp_packet = build_xmp_packet(phi, alpha, kappa)
        if xmp_packet:
            try:
                sidecar = path.with_suffix(path.suffix + ".xmp")
                sidecar.write_text(xmp_packet, encoding="utf-8")
            except Exception:
                # If sidecar fails, silently continue; UserComment still has JSON payload
                pass
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
    logs: List[Dict[str, Any]] = []

    for row in rows:
        name_raw = (row.get("image_name") or "").strip()
        name = name_raw.lower()
        lat_raw = (row.get("latitude") or "").strip()
        lon_raw = (row.get("longitude") or "").strip()
        alt_raw = (row.get("altitude") or "").strip()
        phi_raw = (row.get("phi") or "").strip()
        alpha_raw = (row.get("alpha") or "").strip()
        kappa_raw = (row.get("kappa") or "").strip()

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
        # Optional orientation; parse but do not warn on missing; warn on invalid
        phi = normalize_float(phi_raw) if phi_raw else None
        alpha = normalize_float(alpha_raw) if alpha_raw else None
        kappa = normalize_float(kappa_raw) if kappa_raw else None

        if lat is None:
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Invalid latitude"})
            logs.append({"row": row.get("_row", "?"), "image": name_raw, "success": False, "reason": "Invalid latitude"})
            continue
        if lon is None:
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Invalid longitude"})
            logs.append({"row": row.get("_row", "?"), "image": name_raw, "success": False, "reason": "Invalid longitude"})
            continue
        if not (-90.0 <= lat <= 90.0):
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Latitude out of range"})
            logs.append({"row": row.get("_row", "?"), "image": name_raw, "success": False, "reason": "Latitude out of range"})
            continue
        if not (-180.0 <= lon <= 180.0):
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": "Longitude out of range"})
            logs.append({"row": row.get("_row", "?"), "image": name_raw, "success": False, "reason": "Longitude out of range"})
            continue
        orientation_warnings: List[str] = []
        if phi_raw and phi is None:
            orientation_warnings.append("Invalid phi")
        if alpha_raw and alpha is None:
            orientation_warnings.append("Invalid alpha")
        if kappa_raw and kappa is None:
            orientation_warnings.append("Invalid kappa")
        # If invalid orientation values were provided, drop them but keep GPS write
        if phi is None:
            phi = None
        if alpha is None:
            alpha = None
        if kappa is None:
            kappa = None
        img_path = image_map.get(name)
        if not img_path:
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": f"Image not found for {name_raw}"})
            logs.append({"row": row.get("_row", "?"), "image": name_raw, "success": False, "reason": "Image not found"})
            continue
        if not os.access(img_path, os.W_OK):
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": f"Read-only file skipped: {img_path}"})
            logs.append({"row": row.get("_row", "?"), "image": name_raw, "success": False, "reason": "Read-only file"})
            continue
        orientation = (phi, alpha, kappa)
        success, err = write_gps_to_image(img_path, piexif_mod, lat, lon, alt, orientation)
        if success:
            updated += 1
            reason = "; ".join(orientation_warnings) if orientation_warnings else "OK"
            logs.append({"row": row.get("_row", "?"), "image": name_raw, "success": True, "reason": reason})
        else:
            skipped += 1
            errors.append({"row": row.get("_row", "?"), "reason": f"Failed to write GPS for {img_path}: {err or 'unknown error'}"})
            logs.append({"row": row.get("_row", "?"), "image": name_raw, "success": False, "reason": err or "write failed"})

    result = {
        "processed": total_rows,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "logs": logs,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
    try:
        sys.stdout.flush()
    except Exception:
        pass
    sys.exit(0)

