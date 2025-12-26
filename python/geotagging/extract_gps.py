#!/usr/bin/env python3
"""
Extract GPS EXIF data from images with progress emission.
Input JSON (argv[1]):
{
  "folder": "...",
  "recursive": bool,
  "mode": "scan" | ...,
  "exportCsv": bool,
  "csvPath": "..."
}

Progress messages (stdout lines):
{ "type": "progress", "processed": n, "total": m, "percent": p, "status": "Scanning" }

Final output JSON:
{
  "images": [...],
  "stats": { total, withGps, missingGps, writable },
  "success": true,
  "csvPath": "...?" // optional
}
"""

import csv
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

XMP_NAMESPACE = "http://shamal.tools/ns/cameraorientation/1.0/"


def load_pillow():
    try:
        from PIL import Image, ExifTags  # type: ignore
    except ImportError:
        return None, None
    return Image, ExifTags


Image, ExifTags = load_pillow()

SUPPORTED_EXT = {
    ".jpg",
    ".jpeg",
    ".png",
    ".tif",
    ".tiff",
    ".bmp",
    ".webp",
    ".heic",
    ".dng",
    ".raw",
    ".jfif",
}


def parse_args() -> Dict[str, Any]:
    if len(sys.argv) < 2:
        return {}
    try:
        return json.loads(sys.argv[1])
    except Exception:
        return {}


def dms_to_decimal(dms: Tuple[Any, Any, Any], ref: str) -> Optional[float]:
    try:
        degrees, minutes, seconds = dms

        def to_float(x):
            if isinstance(x, tuple) and len(x) == 2 and x[1]:
                return float(x[0]) / float(x[1])
            return float(x)

        deg = to_float(degrees)
        mins = to_float(minutes)
        secs = to_float(seconds)
        value = deg + (mins / 60.0) + (secs / 3600.0)
        if ref in ["S", "W"]:
            value *= -1
        return round(value, 8)
    except Exception:
        return None


def extract_gps_info(exif: Dict[int, Any]) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    if not exif:
        return None, None, None
    gps_info = exif.get(34853)  # GPSInfo tag
    if not gps_info:
        return None, None, None

    gps_tags = {}
    if ExifTags:
        gps_tags = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps_info.items()}

    lat = lon = alt = None
    try:
        lat_data = gps_tags.get("GPSLatitude")
        lat_ref = gps_tags.get("GPSLatitudeRef", "N")
        lon_data = gps_tags.get("GPSLongitude")
        lon_ref = gps_tags.get("GPSLongitudeRef", "E")
        alt_data = gps_tags.get("GPSAltitude")

        if lat_data and lon_data:
            lat = dms_to_decimal(lat_data, lat_ref)
            lon = dms_to_decimal(lon_data, lon_ref)
        if alt_data is not None:
            if isinstance(alt_data, tuple) and len(alt_data) == 2 and alt_data[1]:
                alt = round(float(alt_data[0]) / float(alt_data[1]), 2)
            else:
                alt = round(float(alt_data), 2)
    except Exception:
        pass

    return lat, lon, alt


def decode_user_comment(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    if isinstance(raw, bytes):
        try:
            prefix = raw[:8]
            payload = raw
            if prefix in {b"ASCII\x00\x00\x00", b"UNICODE\x00", b"UNICODE\x00"}:
                payload = raw[8:]
            try:
                return payload.decode("utf-8", errors="ignore")
            except Exception:
                try:
                    return payload.decode("utf-16", errors="ignore")
                except Exception:
                    return None
        except Exception:
            return None
    try:
        return str(raw)
    except Exception:
        return None


def parse_orientation_comment(text: Optional[str]) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    if not text:
        return None, None, None
    try:
        data = json.loads(text)
        phi = data.get("phi")
        alpha = data.get("alpha")
        kappa = data.get("kappa")
        def to_float(v):
            try:
                return float(v)
            except Exception:
                return None
        return to_float(phi), to_float(alpha), to_float(kappa)
    except Exception:
        return None, None, None


def parse_xmp_sidecar(path: Path) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    sidecar = path.with_suffix(path.suffix + ".xmp")
    if not sidecar.exists():
        return None, None, None
    try:
        text = sidecar.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None, None, None

    def find(tag: str) -> Optional[float]:
        import re
        match = re.search(rf"<sgco:{tag}>(-?\d+(?:\.\d+)?)</sgco:{tag}>", text)
        if match:
            try:
                return float(match.group(1))
            except Exception:
                return None
        return None

    phi = find("Phi")
    alpha = find("Alpha")
    kappa = find("Kappa")
    return phi, alpha, kappa


def extract_orientation(exif: Dict[int, Any], img_path: Optional[Path] = None) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    # Preferred: XMP sidecar if present
    if img_path is not None:
        x_phi, x_alpha, x_kappa = parse_xmp_sidecar(img_path)
        if any(v is not None for v in (x_phi, x_alpha, x_kappa)):
            return x_phi, x_alpha, x_kappa
    if not exif:
        return None, None, None
    if ExifTags:
        for key, val in exif.items():
            if ExifTags.TAGS.get(key) == "UserComment":
                comment = decode_user_comment(val)
                return parse_orientation_comment(comment)
    return None, None, None


def extract_timestamp(exif: Dict[int, Any]) -> Optional[str]:
    if not exif:
        return None
    for tag_name in ("DateTimeOriginal", "DateTime"):
        for key, val in exif.items():
            if ExifTags and ExifTags.TAGS.get(key) == tag_name:
                try:
                    return str(val)
                except Exception:
                    return None
    return None


def extract_camera(exif: Dict[int, Any]) -> Optional[str]:
    if not exif or not ExifTags:
        return None
    model = None
    make = None
    for key, val in exif.items():
        tag = ExifTags.TAGS.get(key)
        if tag == "Model":
            model = str(val)
        elif tag == "Make":
            make = str(val)
    if model and make:
        return f"{make} {model}".strip()
    return model or make


def is_writable_image(path: Path) -> bool:
    if path.suffix.lower() not in {".jpg", ".jpeg"}:
        return False
    return os.access(path, os.W_OK)


def process_image(path: Path) -> Dict[str, Any]:
    writable = is_writable_image(path)
    base = {
        "filename": path.name,
        "path": str(path),
        "hasGps": False,
        "latitude": None,
        "longitude": None,
        "altitude": None,
        "phi": None,
        "alpha": None,
        "kappa": None,
        "writable": writable,
        "exifStatus": "READ_ONLY" if not writable else "NO_EXIF",
        "timestamp": None,
        "camera": None,
        "width": None,
        "height": None,
    }

    if not Image:
        return base

    try:
        with Image.open(path) as img:
            exif = {}
            try:
                exif = img._getexif() or {}
            except Exception:
                exif = {}

            lat, lon, alt = extract_gps_info(exif)
            phi, alpha, kappa = extract_orientation(exif, path)
            ts = extract_timestamp(exif)
            camera = extract_camera(exif)

            base["latitude"] = lat
            base["longitude"] = lon
            base["altitude"] = alt
            base["phi"] = phi
            base["alpha"] = alpha
            base["kappa"] = kappa
            base["timestamp"] = ts
            base["camera"] = camera
            try:
                w, h = img.size
                base["width"], base["height"] = int(w), int(h)
            except Exception:
                pass
            base["hasGps"] = lat is not None and lon is not None

            if writable:
                base["exifStatus"] = "OK" if base["hasGps"] else "NO_EXIF"
            else:
                base["exifStatus"] = "READ_ONLY"
    except Exception:
        pass

    return base


def fmt_num(value: Optional[float]) -> str:
    if value is None:
        return ""
    try:
        return f"{float(value):.6f}"
    except Exception:
        return ""


def iter_image_paths(folder: Path, recursive: bool) -> List[Path]:
    pattern = "**/*" if recursive else "*"
    paths: List[Path] = []
    for path in folder.glob(pattern):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXT:
            paths.append(path)
    return paths


def scan_folder(folder: Path, recursive: bool, progress_every: int = 10) -> Dict[str, Any]:
    images: List[Dict[str, Any]] = []
    paths = iter_image_paths(folder, recursive)
    total = len(paths)
    if total == 0:
        emit_progress(0, 0)
        return {"images": images, "stats": compute_stats(images)}
    for idx, path in enumerate(paths, start=1):
        images.append(process_image(path))
        if progress_every and idx % progress_every == 0:
            emit_progress(idx, total)
    emit_progress(total, total)
    stats = compute_stats(images)
    return {"images": images, "stats": stats}


def emit_progress(done: int, total: int) -> None:
    try:
        percent = 0
        if total:
            percent = int(min(100, max(0, (done / total) * 100)))
        payload = {
            "type": "progress",
            "processed": done,
            "total": total,
            "percent": percent,
            "status": "Scanning",
        }
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def compute_stats(images: List[Dict[str, Any]]) -> Dict[str, int]:
    total = len(images)
    with_gps = sum(1 for i in images if i.get("hasGps"))
    writable = sum(1 for i in images if i.get("writable"))
    return {
        "total": total,
        "withGps": with_gps,
        "missingGps": total - with_gps,
        "writable": writable,
    }


def main():
    payload = parse_args()
    folder = payload.get("folder")
    recursive = bool(payload.get("recursive", True))
    export_csv = bool(payload.get("exportCsv"))
    csv_path = payload.get("csvPath")
    mode = payload.get("mode")

    if not folder:
        print(json.dumps({"error": "Folder is required", "images": [], "stats": {}}))
        return

    folder_path = Path(folder)
    if not folder_path.exists() or not folder_path.is_dir():
        print(json.dumps({"error": "Folder not found", "images": [], "stats": {}}))
        return

    if not Image:
        print(json.dumps({"error": "Pillow not installed", "images": [], "stats": {}}))
        return

    result_scan = scan_folder(folder_path, recursive)
    images = result_scan.get("images", [])
    stats = result_scan.get("stats", compute_stats(images))

    if mode == "scan":
        complete_payload = {"type": "complete", "success": True, "images": images, "stats": stats}
        print(json.dumps(complete_payload, ensure_ascii=False))
        return

    if export_csv:
        target_path = Path(csv_path) if csv_path else folder_path / "gps_export.csv"
        try:
            ordered = sorted(images, key=lambda x: (x.get("filename") or "").lower())
            with target_path.open("w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["filename", "latitude", "longitude", "altitude", "phi", "alpha", "kappa"])
                for img in ordered:
                    writer.writerow(
                        [
                            img.get("filename", ""),
                            fmt_num(img.get("latitude")),
                            fmt_num(img.get("longitude")),
                            fmt_num(img.get("altitude")),
                            fmt_num(img.get("phi")),
                            fmt_num(img.get("alpha")),
                            fmt_num(img.get("kappa")),
                        ]
                    )
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "error": f"CSV export failed: {exc}",
                        "images": images,
                        "stats": stats,
                        "csvPath": str(target_path),
                    },
                    ensure_ascii=False,
                )
            )
            return

        result = {"images": images, "stats": stats, "csvPath": str(target_path)}
        print(json.dumps(result, ensure_ascii=False))
        return

    result = {"images": images, "stats": stats}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
    try:
        sys.stdout.flush()
    except Exception:
        pass
    sys.exit(0)

