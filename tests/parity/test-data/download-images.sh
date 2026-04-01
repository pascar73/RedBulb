#!/bin/bash
# Download open-licensed test images for parity tests

set -e

echo "Downloading test images..."

# JPEG 1: Landscape (Unsplash)
# Using Unsplash's sample image API (free to use)
echo "1. Downloading landscape JPEG..."
curl -L "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&q=90" \
  -o test-image-01.jpg

# JPEG 2: Portrait (Unsplash)
echo "2. Downloading portrait JPEG..."
curl -L "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=1920&h=1080&q=90" \
  -o test-image-02.jpg

# High-ISO noisy image (Unsplash - low light scene)
echo "3. Downloading noisy/high-ISO JPEG..."
curl -L "https://images.unsplash.com/photo-1518005068251-37900150dfca?w=1920&h=1080&q=90" \
  -o test-noisy-iso6400.jpg

echo ""
echo "Note: RAW files (NEF/CR2) require manual download from camera manufacturers"
echo "Canon sample RAW: https://www.canon.com/sample-images"
echo "Nikon sample RAW: https://www.nikon.com/sample-images"
echo ""
echo "For now, we'll use JPEGs for initial testing."
echo "RAW support will be added in Phase 2."
echo ""
echo "✅ JPEG dataset complete!"
