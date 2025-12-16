import json
import shutil
import sys
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    from PIL import Image, ExifTags  # type: ignore
except Exception:  # Pillow might not be present; proceed without EXIF timestamp
    Image = None  # type: ignore
    ExifTags = {}  # type: ignore

VALID_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}
MANIFEST_NAME = ".shamal_flight_rename_last.json"


def parse_flight_filename(filename: str) -> Tuple[int, int]:
    """
    Parse a filename that follows the Flight_##_#### format to extract flight and image numbers.
    Returns (flight_number, image_number) or (None, None) if not matching the pattern.
    """
    # Remove extension for pattern matching
    stem = Path(filename).stem
    
    # Match Flight_##_#### pattern (case insensitive)
    match = re.match(r'^Flight_(\d{2})_(\d{4})$', stem, re.IGNORECASE)
    if match:
        try:
            flight_num = int(match.group(1))
            image_num = int(match.group(2))
            return flight_num, image_num
        except ValueError:
            pass
    return None, None


def load_payload() -> Dict[str, Any]:
    if len(sys.argv) < 2:
        return {}
    try:
        return json.loads(sys.argv[1]) or {}
    except Exception:
        return {}


def iter_images(folder: Path) -> List[Path]:
    imgs: List[Path] = []
    if not folder.exists() or not folder.is_dir():
        return imgs
    for child in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if child.is_file() and child.suffix.lower() in VALID_EXT:
            imgs.append(child)
    return imgs


def pad_hashes(pattern: str, seq: int, min_width: int = 1) -> str:
    out = pattern
    while "#" in out:
        idx = out.find("#")
        end = idx
        while end < len(out) and out[end] == "#":
            end += 1
        width = max(end - idx, min_width)
        padded = str(seq).zfill(width)
        out = out[:idx] + padded + out[end:]
    return out


def build_name(options: Dict[str, Any], idx: int, ext: str, original: str, ts: str) -> Tuple[str, int, int]:
    pattern_raw = (options.get("pattern") or "").strip()
    pattern = pattern_raw or "Flight_##_####"
    
    # Check if pattern matches the specific Flight_##_#### format (with or without .jpg extension)
    flight_pattern_match = re.match(r"^Flight_##_####(?:\.jpg)?$", pattern, re.IGNORECASE)
    if flight_pattern_match:
        # Force the pattern to be exactly "Flight_##_####" without extension
        pattern = "Flight_##_####"
    
    if pattern.count("#") < 2:
        pattern = "Flight_##_####"
    # Remove any extension from pattern to prevent duplicates
    pattern_path = Path(pattern)
    if pattern_path.suffix:
        pattern = pattern_path.stem
    prefix = (options.get("prefix") or "").strip()
    suffix = (options.get("suffix") or "").strip()
    start_flight = int(options.get("startFlight") or 1)
    start_image = int(options.get("startImage") or 1)
    include_orig = bool(options.get("includeOriginal"))
    include_ts = bool(options.get("includeTimestamp"))

    flight_no = start_flight + idx
    image_no = start_image + idx

    # Replace first hash group with flight, second with image (enforce min widths)
    replaced = pattern
    if "##" in replaced:
        first_idx = replaced.find("#")
        run = 0
        while first_idx + run < len(replaced) and replaced[first_idx + run] == "#":
            run += 1
        width = max(run, 2)
        replaced = replaced.replace("#" * run, str(flight_no).zfill(width), 1)
    if "#" in replaced:
        replaced = pad_hashes(replaced, image_no, min_width=4)

    parts: List[str] = []
    if prefix:
        parts.append(prefix)
    parts.append(replaced)
    if suffix:
        parts.append(suffix)
    if include_orig and original:
        parts.append(Path(original).stem)
    if include_ts and ts:
        parts.append(ts.replace(":", "").replace(" ", "_"))

    name = "_".join([p for p in parts if p])
    # For the Flight_##_#### pattern, always add .jpg extension
    if flight_pattern_match and not name.lower().endswith('.jpg'):
        return name + '.jpg', flight_no, image_no
    # Avoid duplicate extensions - only add ext if name doesn't already end with it
    elif name.lower().endswith(ext.lower()):
        return name, flight_no, image_no
    else:
        return name + ext.lower(), flight_no, image_no


def load_timestamp(img_path: Path) -> str:
    if not Image:
        return ""
    try:
        with Image.open(img_path) as img:
            exif = img._getexif() or {}
            if not exif:
                return ""
            tag_map = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
            ts = tag_map.get("DateTimeOriginal") or tag_map.get("DateTime")
            if not ts:
                return ""
            if isinstance(ts, bytes):
                ts = ts.decode(errors="ignore")
            return str(ts)
    except Exception:
        return ""


def ensure_unique(target_dir: Path, filename: str) -> Path:
    base = Path(filename).stem
    ext = Path(filename).suffix
    candidate = target_dir / filename
    counter = 1
    while candidate.exists():
        candidate = target_dir / f"{base}_{counter}{ext}"
        counter += 1
    return candidate


def write_manifest(output_dir: Path, files: List[Dict[str, Any]]) -> None:
    manifest = output_dir / MANIFEST_NAME
    try:
        manifest.write_text(json.dumps(files, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def undo_last(output_dir: Path) -> Dict[str, Any]:
    manifest = output_dir / MANIFEST_NAME
    if not manifest.exists():
        return {"removed": 0, "errors": ["No manifest found"], "outputFolder": str(output_dir)}
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"removed": 0, "errors": [f"Failed to read manifest: {exc}"], "outputFolder": str(output_dir)}
    removed = 0
    errors: List[str] = []
    for entry in data:
        path = entry.get("targetPath")
        if not path:
            continue
        p = Path(path)
        try:
            if p.exists():
                p.unlink()
                removed += 1
        except Exception as exc:
            errors.append(f"{p.name}: {exc}")
    try:
        manifest.unlink()
    except Exception:
        pass
    return {"removed": removed, "errors": errors, "outputFolder": str(output_dir)}


def process(payload: Dict[str, Any]) -> Dict[str, Any]:
    mode = payload.get("mode", "preview")
    source = payload.get("source")
    output = payload.get("output")
    options = payload.get("options") or {}

    if not source:
        return {"ok": False, "error": "Source folder is required"}

    src_path = Path(source)
    if not src_path.exists() or not src_path.is_dir():
        return {"ok": False, "error": "Source folder invalid"}

    images = iter_images(src_path)

    # Validate pattern: if user provided but missing hashes, flag error
    pattern_raw = (options.get("pattern") or "").strip()
    if pattern_raw:
        # Check if pattern matches the specific Flight_##_#### format (with or without .jpg extension)
        flight_pattern_match = re.match(r"^Flight_##_####(?:\.jpg)?$", pattern_raw, re.IGNORECASE)
        if not flight_pattern_match and pattern_raw.count("#") < 2:
            return {"ok": False, "error": "Invalid pattern: must include flight (##) and image (####) placeholders"}

    if mode == "scan":
        files = [
            {
                "originalName": img.name,
                "newName": "",
                "flightNumber": None,
                "imageNumber": None,
                "sourcePath": str(img),
                "targetPath": str(img),
                "ok": True,
            }
            for img in images
        ]
        return {"ok": True, "files": files, "processed": len(files)}

    # Determine output folder
    if mode in ("execute", "undo"):
        if not output:
            output = str(src_path / "renamed")
    out_path = Path(output) if output else None
    if mode in ("execute", "undo") and out_path:
        out_path.mkdir(parents=True, exist_ok=True)

    files: List[Dict[str, Any]] = []
    updated = 0
    skipped = 0
    errors: List[str] = []
    seen_names = set()

    if mode == "undo" and out_path:
        res = undo_last(out_path)
        res["ok"] = not bool(res.get("errors"))
        return res

    for idx, img in enumerate(images):
        ts = load_timestamp(img) if options.get("includeTimestamp") else ""
        new_name, flight_no, image_no = build_name(options, idx, img.suffix, img.name, ts)
        if mode == "preview":
            target_path = Path(new_name)
        else:
            target_path = ensure_unique(out_path or src_path, new_name) if out_path else img
        entry = {
            "originalName": img.name,
            "newName": new_name if mode == "preview" else target_path.name,
            "flightNumber": flight_no,
            "imageNumber": image_no,
            "sourcePath": str(img),
            "targetPath": str(target_path),
            "ok": True
        }
        if entry["newName"].lower() in seen_names:
            entry["ok"] = False
            entry["error"] = "Duplicate target filename in preview"
            errors.append(f"Duplicate name: {entry['newName']}")
        else:
            seen_names.add(entry["newName"].lower())

        if mode == "preview":
            files.append(entry)
            continue
        # execute
        try:
            shutil.copy2(str(img), str(target_path))
            updated += 1
        except Exception as exc:
            entry["ok"] = False
            entry["error"] = str(exc)
            errors.append(f"{img.name}: {exc}")
            skipped += 1
        files.append(entry)

    result: Dict[str, Any] = {
        "ok": True,
        "files": files,
        "processed": len(files),
        "updated": updated if mode == "execute" else 0,
        "skipped": skipped if mode == "execute" else 0,
        "errors": errors,
    }
    if mode == "execute" and out_path:
        write_manifest(out_path, files)
        result["outputFolder"] = str(out_path)
        result["copied"] = updated
        result["failed"] = skipped
    return result


def main():
    payload = load_payload()
    res = process(payload)
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()

