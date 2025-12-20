#!/usr/bin/env python3
"""
Map Loader Script for Shamal Tools Map Organizer Module

This script scans a folder for image files, extracts GPS coordinates from EXIF data,
and returns a JSON list of geotagged images.

Usage:
    python map_loader.py <folder_path>

Returns:
    JSON list of geotagged images with filename, filepath, latitude, and longitude
"""

import os
import sys
import json
from pathlib import Path
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS


def convert_to_degrees(value):
    """
    Convert GPS coordinates stored in EXIF to degrees in float format
    
    Args:
        value: GPS coordinate in degrees/minutes/seconds format
        
    Returns:
        float: Decimal degrees
    """
    d = float(value[0])
    m = float(value[1])
    s = float(value[2])
    return d + (m / 60.0) + (s / 3600.0)


def get_gps_info(exif_data):
    """
    Extract GPS information from EXIF data
    
    Args:
        exif_data: Dictionary of EXIF data
        
    Returns:
        tuple: (latitude, longitude) or (None, None) if not found
    """
    gps_info = {}
    
    if not exif_data:
        return None, None
        
    for tag, value in exif_data.items():
        tag_name = TAGS.get(tag, tag)
        if tag_name == "GPSInfo":
            for gps_tag, gps_value in value.items():
                gps_tag_name = GPSTAGS.get(gps_tag, gps_tag)
                gps_info[gps_tag_name] = gps_value
            break
    
    if not gps_info:
        return None, None
        
    # Check if GPSLatitude and GPSLongitude exist
    if 'GPSLatitude' not in gps_info or 'GPSLongitude' not in gps_info:
        return None, None
        
    # Get latitude
    gps_latitude = gps_info['GPSLatitude']
    gps_latitude_ref = gps_info.get('GPSLatitudeRef', 'N')
    
    # Get longitude
    gps_longitude = gps_info['GPSLongitude']
    gps_longitude_ref = gps_info.get('GPSLongitudeRef', 'E')
    
    # Convert to decimal degrees
    lat = convert_to_degrees(gps_latitude)
    if gps_latitude_ref != "N":
        lat = 0 - lat
        
    lon = convert_to_degrees(gps_longitude)
    if gps_longitude_ref != "E":
        lon = 0 - lon
        
    return lat, lon


def scan_images_for_gps(folder_path):
    """
    Scan folder for image files and extract GPS coordinates
    
    Args:
        folder_path (str): Path to folder containing images
        
    Returns:
        dict: Contains 'images' list and 'total_count' integer
    """
    # Supported image formats
    image_extensions = ('.jpg', '.jpeg', '.png')
    
    # Results
    geotagged_images = []
    total_images = 0
    
    # Process in batches to handle large datasets efficiently
    batch_size = 1000
    current_batch = []
    
    # Only scan the top-level contents of the selected folder (no recursion)
    for entry in Path(folder_path).iterdir():
        if not entry.is_file():
            continue  # Skip subfolders and non-file entries
            
        # Check if file is an image
        if entry.suffix.lower() in image_extensions:
            total_images += 1
            file_path = str(entry)
            
            # Add to current batch
            current_batch.append((entry.name, file_path))
            
            # Process batch when it reaches the batch size
            if len(current_batch) >= batch_size:
                process_batch(current_batch, geotagged_images)
                current_batch = []  # Reset batch
    
    # Process remaining files in the final batch
    if current_batch:
        process_batch(current_batch, geotagged_images)
    
    return {
        'images': geotagged_images,
        'total_count': total_images
    }


def process_batch(batch, geotagged_images):
    """
    Process a batch of images to extract GPS coordinates
    
    Args:
        batch (list): List of (filename, filepath) tuples
        geotagged_images (list): List to append geotagged images to
    """
    for file, file_path in batch:
        try:
            # Open image and get EXIF data
            with Image.open(file_path) as image:
                exif_data = image._getexif()
                
                # Extract GPS info
                lat, lon = get_gps_info(exif_data)
                
                # If GPS data exists, add to results
                if lat is not None and lon is not None:
                    geotagged_images.append({
                        'filename': file,
                        'filepath': file_path,
                        'latitude': lat,
                        'longitude': lon
                    })
        except Exception as e:
            # Skip files that can't be processed
            continue


def main():
    """
    Main function to process folder and output JSON result
    """
    # Check if folder path provided
    if len(sys.argv) != 2:
        print(json.dumps({'error': 'Folder path argument required'}))
        sys.exit(1)
        
    folder_path = sys.argv[1]
    
    # Check if folder exists
    if not os.path.exists(folder_path):
        print(json.dumps({'error': 'Folder not found'}))
        sys.exit(1)
        
    if not os.path.isdir(folder_path):
        print(json.dumps({'error': 'Path is not a directory'}))
        sys.exit(1)
    
    # Scan images and get GPS data
    result = scan_images_for_gps(folder_path)
    
    # Output as JSON
    print(json.dumps(result))


if __name__ == "__main__":
    main()
    try:
        sys.stdout.flush()
    except Exception:
        pass
    sys.exit(0)