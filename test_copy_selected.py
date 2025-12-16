#!/usr/bin/env python3
"""
Test script for copy_selected.py
"""

import json
import os
import tempfile
import shutil
from pathlib import Path

# Create temporary directories for testing
source_dir = tempfile.mkdtemp()
dest_dir = tempfile.mkdtemp()

try:
    # Create some test files in the source directory
    test_files = ["image1.jpg", "image2.jpg", "document.txt", "photo.png"]
    
    for filename in test_files:
        file_path = Path(source_dir) / filename
        with open(file_path, "w") as f:
            f.write(f"Content of {filename}")
    
    # Create a list of files to copy (just images)
    files_to_copy = ["image1.jpg", "image2.jpg", "photo.png"]
    
    # Convert to JSON
    json_files = json.dumps(files_to_copy)
    
    # Print the command that would be executed
    print(f"Would execute: python copy_selected.py {source_dir} {dest_dir} '{json_files}'")
    
    # Test the copy_selected.py script
    import subprocess
    import sys
    
    result = subprocess.run([
        sys.executable, 
        "python/mapOrganizer/copy_selected.py",
        source_dir,
        dest_dir,
        json_files
    ], capture_output=True, text=True)
    
    print("Return code:", result.returncode)
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
    
    # Check if files were copied correctly
    dest_path = Path(dest_dir)
    copied_files = list(dest_path.iterdir())
    
    print(f"\nCopied files ({len(copied_files)}):")
    for file in copied_files:
        print(f"  - {file.name}")
        
finally:
    # Clean up temporary directories
    shutil.rmtree(source_dir)
    shutil.rmtree(dest_dir)