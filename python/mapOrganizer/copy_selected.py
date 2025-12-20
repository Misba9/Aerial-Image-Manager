#!/usr/bin/env python3
"""
Selective image copying script for the Map Organizer module.

This script accepts three command-line arguments:
1. Source folder path
2. Destination folder path
3. JSON-formatted list of filenames

It validates the source folder, creates the destination folder if needed,
and copies only the specified files from source to destination.
"""

import json
import os
import shutil
import sys
from pathlib import Path


def validate_source_folder(source_path):
    """
    Validate that the source folder exists and is accessible.
    
    Args:
        source_path (str): Path to the source folder
        
    Returns:
        tuple: (is_valid, error_message)
    """
    try:
        path = Path(source_path)
        if not path.exists():
            return False, f"Source folder does not exist: {source_path}"
        if not path.is_dir():
            return False, f"Source path is not a directory: {source_path}"
        if not os.access(path, os.R_OK):
            return False, f"Source folder is not readable: {source_path}"
        return True, ""
    except Exception as e:
        return False, f"Error validating source folder: {str(e)}"


def create_destination_folder(destination_path):
    """
    Create the destination folder if it doesn't exist.
    
    Args:
        destination_path (str): Path to the destination folder
        
    Returns:
        tuple: (success, error_message)
    """
    try:
        path = Path(destination_path)
        path.mkdir(parents=True, exist_ok=True)
        return True, ""
    except PermissionError:
        return False, f"Permission denied: Cannot create destination folder {destination_path}"
    except Exception as e:
        return False, f"Error creating destination folder: {str(e)}"


def copy_selected_files(source_path, destination_path, filenames):
    """
    Copy selected files from source to destination.
    Processes files in batches for better memory handling with large datasets.
    
    Args:
        source_path (str): Path to the source folder
        destination_path (str): Path to the destination folder
        filenames (list): List of filenames to copy
        
    Returns:
        dict: Result with success status and copied count
    """
    copied_count = 0
    source_dir = Path(source_path)
    dest_dir = Path(destination_path)
    
    # Process in batches to handle large datasets efficiently
    batch_size = 100
    total_files = len(filenames)
    
    # Process in batches
    for i in range(0, total_files, batch_size):
        batch = filenames[i:i + batch_size]
        
        # Process each file in the batch
        for filename in batch:
            try:
                # Construct full source path
                source_file = source_dir / filename
                
                # Verify file exists in source folder
                if not source_file.exists():
                    print(f"Warning: File not found in source folder: {filename}", file=sys.stderr)
                    continue
                    
                if not source_file.is_file():
                    print(f"Warning: Not a file: {filename}", file=sys.stderr)
                    continue
                    
                # Construct full destination path
                dest_file = dest_dir / filename
                
                # Copy file preserving metadata
                shutil.copy2(source_file, dest_file)
                copied_count += 1
                
            except PermissionError:
                print(f"Error: Permission denied copying {filename}", file=sys.stderr)
            except Exception as e:
                print(f"Error copying {filename}: {str(e)}", file=sys.stderr)
    
    return {
        "success": True,
        "copied_count": copied_count
    }


def main():
    """Main function to run the script."""
    # Check command line arguments
    if len(sys.argv) != 4:
        result = {
            "success": False,
            "copied_count": 0,
            "error": "Usage: python copy_selected.py <source_folder> <destination_folder> <json_filenames>"
        }
        print(json.dumps(result))
        sys.exit(1)
    
    source_folder = sys.argv[1]
    destination_folder = sys.argv[2]
    filenames_json = sys.argv[3]
    
    try:
        # Parse JSON filenames
        filenames = json.loads(filenames_json)
        if not isinstance(filenames, list):
            raise ValueError("Filenames must be a JSON array")
    except json.JSONDecodeError as e:
        result = {
            "success": False,
            "copied_count": 0,
            "error": f"Invalid JSON for filenames: {str(e)}"
        }
        print(json.dumps(result))
        sys.exit(1)
    except ValueError as e:
        result = {
            "success": False,
            "copied_count": 0,
            "error": str(e)
        }
        print(json.dumps(result))
        sys.exit(1)
    
    # Validate source folder
    is_valid, error_msg = validate_source_folder(source_folder)
    if not is_valid:
        result = {
            "success": False,
            "copied_count": 0,
            "error": error_msg
        }
        print(json.dumps(result))
        sys.exit(1)
    
    # Create destination folder
    success, error_msg = create_destination_folder(destination_folder)
    if not success:
        result = {
            "success": False,
            "copied_count": 0,
            "error": error_msg
        }
        print(json.dumps(result))
        sys.exit(1)
    
    # Copy selected files
    try:
        result = copy_selected_files(source_folder, destination_folder, filenames)
        print(json.dumps(result))
    except Exception as e:
        result = {
            "success": False,
            "copied_count": 0,
            "error": f"Unexpected error during file copying: {str(e)}"
        }
        print(json.dumps(result))
        sys.exit(1)


if __name__ == "__main__":
    main()
    try:
        sys.stdout.flush()
    except Exception:
        pass
    sys.exit(0)