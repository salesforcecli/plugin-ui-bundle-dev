#!/usr/bin/env node
/*
 * Cross-platform script to copy HTML templates from src to lib.
 * Used by postbuild to ensure templates are available at runtime.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'templates');
const destDir = path.join(__dirname, '..', 'lib', 'templates');

// Create destination directory if it doesn't exist
fs.mkdirSync(destDir, { recursive: true });

// Copy all HTML files
const htmlFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.html'));

if (htmlFiles.length === 0) {
  console.log('No HTML templates found to copy.');
  process.exit(0);
}

htmlFiles.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied: ${file}`);
});

console.log(`Successfully copied ${htmlFiles.length} template(s) to lib/templates/`);
