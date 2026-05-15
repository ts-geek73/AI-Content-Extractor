# AI Content Extractor Extension

A Chrome extension to extract and process content from web pages.

## Project Structure

- `content-extractor/manifest.json` - Extension manifest
- `content-extractor/background.js` - Background logic
- `content-extractor/content.js` - Content script for page extraction
- `content-extractor/popup.html` - Extension popup UI
- `content-extractor/popup.js` - Popup logic
- `content-extractor/system-prompt.js` - Prompt/config logic
- `content-extractor/icons/` - Extension icons

## Build Steps

This extension does not require a build process.

1. Clone or download this repository.
2. Make sure the extension files are inside the `content-extractor/` folder.

## Load Extension in Chrome

1. Open Chrome.
2. Go to `chrome://extensions/`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select the folder:
   - `/home/techstaunch/Desktop/AI-Content-Extractor/content-extractor`
6. The extension will now appear in your extensions list.

## How to Use

1. Open Cluade webpage where you want to extract content.
2. Click the extension icon in Chrome toolbar.
3. Open the extension popup.
4. Use the available actions/buttons in the popup to extract/process content.
5. Review the extracted output from the popup workflow.

