#!/bin/bash

# Script to sync daily markdown files to Hugo content directory
# This script adds Hugo front matter and copies files from daily/ to content/daily/

set -e

DAILY_DIR="daily"
HUGO_CONTENT_DIR="content/daily"

# Create directories if they don't exist
mkdir -p "$DAILY_DIR"
mkdir -p "$HUGO_CONTENT_DIR"

echo "Syncing daily markdown files to Hugo content directory..."

# Process each markdown file in daily directory
for file in "$DAILY_DIR"/*.md; do
    # Skip if no files found or if it's SUMMARY.md
    [ -e "$file" ] || continue
    basename=$(basename "$file")
    [ "$basename" = "SUMMARY.md" ] && continue
    
    # Extract date from filename (format: YYYY-MM-DD.md)
    if [[ $basename =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})\.md$ ]]; then
        date="${BASH_REMATCH[1]}"
        
        # Check if file already has front matter
        if head -n 1 "$file" | grep -q "^---$"; then
            echo "Skipping $basename - already has front matter"
            # Just copy the file as is
            cp "$file" "$HUGO_CONTENT_DIR/$basename"
        else
            # Extract title from first heading and clean it (remove all # and markdown)
            title=$(grep -m 1 "^#" "$file" | sed 's/^#\+\s*//' | sed 's/[#\*\`]//g' | sed 's/^[[:space:]]*//' || echo "AI 洞察日报 - $date")
            
            # Create Hugo file with front matter
            cat > "$HUGO_CONTENT_DIR/$basename" <<EOF
---
title: "$title"
date: ${date}T09:00:00+08:00
description: "AI 洞察日报 - $(date -d "$date" "+%Y年%m月%d日" 2>/dev/null || date -j -f "%Y-%m-%d" "$date" "+%Y年%m月%d日" 2>/dev/null || echo "$date")"
categories:
  - 日报
tags:
  - AI
  - 人工智能
  - 行业动态
draft: false
---

EOF
            # Append original content
            cat "$file" >> "$HUGO_CONTENT_DIR/$basename"
            echo "Processed $basename -> $HUGO_CONTENT_DIR/$basename"
        fi
    else
        echo "Skipping $basename - doesn't match date pattern"
    fi
done

echo "Sync complete!"