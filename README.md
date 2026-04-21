# Douyin Downloader

A Tampermonkey userscript for downloading the current Douyin web video or batch-selecting videos from a Douyin profile page.

## Features

- Download the current Douyin video from video pages and `jingxuan` pages
- Batch scan a profile page, then choose which videos to download
- Clean and readable file naming for both single and batch downloads
- Floating side button with drag positioning
- Visible progress bubble for single downloads and batch scanning

## Files

- `douyin-downloader.user.js`: the userscript file to publish on Greasy Fork and install in Tampermonkey

## Local Development

1. Edit `douyin-downloader.user.js`
2. Reload the script in Tampermonkey
3. Test on Douyin web pages

## Publish To Greasy Fork

1. Create a new script on Greasy Fork
2. Upload or paste the contents of `douyin-downloader.user.js`
3. After the GitHub repository is finalized, update the metadata block with:
   - `@homepageURL`
   - `@supportURL`
   - `@updateURL`
   - `@downloadURL`

## Sync To GitHub

Recommended repository name:

- `W-ArcherEmiya/douyin-downloader`

Recommended file layout:

- `README.md`
- `LICENSE`
- `.gitignore`
- `douyin-downloader.user.js`

## Notes

- This project targets the Douyin web UI and may require maintenance when Douyin changes page structure.
- The script is provided under the MIT License.
