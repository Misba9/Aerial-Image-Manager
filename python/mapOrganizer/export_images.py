#!/usr/bin/env python3
"""
Export selected images to a new folder with timestamp-based naming.
"""

import os
import sys
import json
import shutil
from datetime import datetime
from pathlib import Path


def export_images(source_paths, destination_folder):
    """
    Export selected images to a new folder with timestamp-based naming.
    Handles large datasets efficiently by processing in batches.
    
    Args:
        source_paths (list): List of full file paths to source images
        destination_folder (str): Path to destination folder
        
    Returns:
        dict: Result with success status and details
    """
    try:
        # Validate inputs
        if not source_paths:
            return {"success": False, "error": "No source images provided"}
            
        if not destination_folder:
            return {"success": False, "error": "Destination folder not specified"}
            
        # Check if destination folder exists and is writable
        dest_path = Path(destination_folder)
        if not dest_path.exists():
            return {"success": False, "error": "Destination folder does not exist"}
            
        if not os.access(dest_path, os.W_OK):
            return {"success": False, "error": "Destination folder is not writable"}
        
        # Create timestamp for folder name
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        export_folder_name = f"Exported_Region_{timestamp}"
        export_folder_path = dest_path / export_folder_name
        
        # Create the export folder
        try:
            export_folder_path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            return {"success": False, "error": f"Failed to create export folder: {str(e)}"}
        
        # Process files in batches to handle large datasets efficiently
        batch_size = 100
        total_files = len(source_paths)
        exported_count = 0
        failed_files = []
        
        # Process in batches
        for i in range(0, total_files, batch_size):
            batch = source_paths[i:i + batch_size]
            
            # Process each file in the batch
            for source_path_str in batch:
                try:
                    source_path = Path(source_path_str)
                    
                    # Validate source file
                    if not source_path.exists():
                        failed_files.append({
                            "file": source_path_str,
                            "error": "Source file does not exist"
                        })
                        continue
                        
                    if not source_path.is_file():
                        failed_files.append({
                            "file": source_path_str,
                            "error": "Source path is not a file"
                        })
                        continue
                    
                    # Get filename
                    filename = source_path.name
                    
                    # Destination path
                    dest_file_path = export_folder_path / filename
                    
                    # Copy file preserving metadata
                    shutil.copy2(source_path, dest_file_path)
                    exported_count += 1
                    
                except Exception as e:
                    failed_files.append({
                        "file": source_path_str,
                        "error": str(e)
                    })
        
        # Prepare result
        result = {
            "success": True,
            "exported_count": exported_count,
            "export_folder_name": export_folder_name,
            "export_folder_path": str(export_folder_path)
        }
        
        # Include failed files if any
        if failed_files:
            result["failed_files"] = failed_files
            
        return result
        
    except Exception as e:
        return {"success": False, "error": f"Unexpected error during export: {str(e)}"}


def main():
    """Main function to handle command line arguments and execute export."""
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        
        # Extract parameters
        source_paths = input_data.get("sourcePaths", [])
        destination_folder = input_data.get("destination", "")
        
        # Execute export
        result = export_images(source_paths, destination_folder)
        
        # Output result as JSON
        print(json.dumps(result))
        
    except json.JSONDecodeError as e:
        error_result = {
            "success": False,
            "error": f"Invalid JSON input: {str(e)}"
        }
        print(json.dumps(error_result))
        sys.exit(1)
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Error in main function: {str(e)}"
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()