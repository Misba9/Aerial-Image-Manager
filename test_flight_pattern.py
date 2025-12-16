#!/usr/bin/env python3
"""
Test script to verify the flight pattern matching functionality
"""

import sys
from pathlib import Path

# Add the flightRenamer directory to the path so we can import the module
sys.path.insert(0, str(Path(__file__).parent / "python" / "flightRenamer"))

from rename_images import parse_flight_filename

def test_parse_flight_filename():
    """Test the parse_flight_filename function with various inputs"""
    
    # Test cases: (filename, expected_flight_num, expected_image_num)
    test_cases = [
        # Valid cases
        ("Flight_01_0001.jpg", 1, 1),
        ("Flight_12_1234.png", 12, 1234),
        ("Flight_99_9999.tif", 99, 9999),
        ("flight_05_0500.jpeg", 5, 500),
        ("FLIGHT_10_1000.webp", 10, 1000),
        
        # Invalid cases
        ("Flight_1_0001.jpg", None, None),      # Single digit flight number
        ("Flight_01_001.jpg", None, None),      # Three digit image number
        ("Flight_01_00001.jpg", None, None),    # Five digit image number
        ("Flight_A1_0001.jpg", None, None),     # Non-numeric flight number
        ("Flight_01_B001.jpg", None, None),     # Non-numeric image number
        ("Image_01_0001.jpg", None, None),      # Wrong prefix
        ("Flight_01_0001_backup.jpg", None, None),  # Extra text
        ("Flight_01.jpg", None, None),          # Missing image number
        ("01_0001.jpg", None, None),            # Missing prefix
    ]
    
    print("Testing parse_flight_filename function:")
    print("=" * 50)
    
    passed = 0
    failed = 0
    
    for filename, expected_flight, expected_image in test_cases:
        result_flight, result_image = parse_flight_filename(filename)
        
        if result_flight == expected_flight and result_image == expected_image:
            print(f"✓ PASS: {filename} -> ({result_flight}, {result_image})")
            passed += 1
        else:
            print(f"✗ FAIL: {filename} -> Expected ({expected_flight}, {expected_image}), Got ({result_flight}, {result_image})")
            failed += 1
    
    print("=" * 50)
    print(f"Results: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("All tests passed!")
        return True
    else:
        print("Some tests failed!")
        return False

if __name__ == "__main__":
    success = test_parse_flight_filename()
    sys.exit(0 if success else 1)