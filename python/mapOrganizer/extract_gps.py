#!/usr/bin/env python3
"""
Extract GPS coordinates from JPG images in a folder.

This script accepts a folder path as a command-line argument, recursively scans for JPG images,
reads EXIF GPS data from each image, converts the GPS coordinates to decimal latitude and longitude values,
skips any images that don't contain GPS data, and outputs a JSON array of objects containing the filename
and its corresponding GPS coordinates.

Usage: python extract_gps.py <folder_path>
"""

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from PIL import Image, ExifTags
except ImportError:
    print(json.dumps({"error": "Pillow library is required but not installed"}))
    sys.exit(1)


def dms_to_decimal(dms: Tuple[Any, Any, Any], ref: str) -> Optional[float]:
    """
    Convert GPS degrees/minutes/seconds to decimal degrees.
    
    Args:
        dms: Tuple of (degrees, minutes, seconds)
        ref: Reference direction ('N', 'S', 'E', 'W')
        
    Returns:
        Decimal degrees or None if conversion fails
    """
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


def extract_gps_from_image(image_path: Path) -> Optional[Dict[str, Any]]:
    """
    Extract GPS coordinates from a single image file.
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Dictionary with filename, lat, and lng or None if no GPS data
    """
    try:
        with Image.open(image_path) as img:
            exif = img._getexif()
            if not exif:
                return None

            # Extract GPS info
            gps_info = exif.get(34853)  # GPSInfo tag
            if not gps_info:
                return None

            # Parse GPS tags
            gps_tags = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps_info.items()}

            # Extract latitude and longitude data
            lat_data = gps_tags.get("GPSLatitude")
            lat_ref = gps_tags.get("GPSLatitudeRef", "N")
            lon_data = gps_tags.get("GPSLongitude")
            lon_ref = gps_tags.get("GPSLongitudeRef", "E")

            if not lat_data or not lon_data:
                return None

            # Convert to decimal degrees
            lat = dms_to_decimal(lat_data, lat_ref)
            lng = dms_to_decimal(lon_data, lon_ref)

            if lat is None or lng is None:
                return None

            return {
                "filename": image_path.name,
                "lat": lat,
                "lng": lng
            }
    except Exception as e:
        # Silently skip files with errors
        return None


def find_jpg_files(folder_path: Path, recursive: bool = True) -> List[Path]:
    """
    Find all JPG files in a folder.
    
    Args:
        folder_path: Path to the folder to search
        recursive: Whether to search subdirectories
        
    Returns:
        List of JPG file paths
    """
    jpg_extensions = {'.jpg', '.jpeg'}
    jpg_files = []
    
    if recursive:
        pattern = "**/*"
        paths = folder_path.glob(pattern)
    else:
        paths = folder_path.iterdir()
    
    for path in paths:
        if path.is_file() and path.suffix.lower() in jpg_extensions:
            jpg_files.append(path)
            
    return jpg_files


def extract_gps_from_folder(folder_path: str) -> List[Dict[str, Any]]:
    """
    Extract GPS coordinates from all JPG images in a folder.
    Processes files in batches for better memory handling with large datasets.
    
    Args:
        folder_path: Path to the folder containing images
        
    Returns:
        List of dictionaries with filename and GPS coordinates
    """
    try:
        path = Path(folder_path)
        if not path.exists() or not path.is_dir():
            print(json.dumps({"error": f"Folder '{folder_path}' does not exist or is not a directory"}))
            return []

        # Find all JPG files
        jpg_files = find_jpg_files(path, recursive=True)
        
        # Process in batches to handle large datasets efficiently
        batch_size = 1000
        total_files = len(jpg_files)
        gps_data = []
        
        # Process in batches
        for i in range(0, total_files, batch_size):
            batch = jpg_files[i:i + batch_size]
            
            # Extract GPS data from each file in the batch
            for image_path in batch:
                gps_info = extract_gps_from_image(image_path)
                if gps_info:
                    gps_data.append(gps_info)
                
        return gps_data
    except Exception as e:
        print(json.dumps({"error": f"Failed to process folder: {str(e)}"}))
        return []


def main():
    """Main function to run the script."""
    # Check command line arguments
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python extract_gps.py <folder_path>"}))
        sys.exit(1)
    
    folder_path = sys.argv[1]
    
    # Extract GPS data
    gps_data = extract_gps_from_folder(folder_path)
    
    # Output as JSON
    print(json.dumps(gps_data, ensure_ascii=False))


if __name__ == "__main__":
    main()