import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

function quotedAttribute(tag, name) {
  const attribute = new RegExp(`\\b${name}\\s*=\\s*(['\"])(.*?)\\1`, 'i').exec(tag);
  return attribute?.[2];
}

function hasAbsoluteAssetPath(html) {
  const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
  if (scriptTags.some((tag) => quotedAttribute(tag, 'src')?.startsWith('/assets/'))) {
    return true;
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  return linkTags.some((tag) => (
    quotedAttribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('stylesheet')
    && quotedAttribute(tag, 'href')?.startsWith('/assets/')
  ));
}

export async function inspectBundle(distDir) {
  const files = await readdir(path.join(distDir, 'assets'));
  const jsFiles = files.filter((file) => file.endsWith('.js'));
  const cssFiles = files.filter((file) => file.endsWith('.css'));
  const errors = [];
  let jsGzipBytes = 0;
  let cssGzipBytes = 0;

  for (const file of jsFiles) {
    const contents = await readFile(path.join(distDir, 'assets', file));
    jsGzipBytes += gzipSync(contents).byteLength;
    if (/phaser/i.test(contents.toString('utf8'))) {
      errors.push(`Phaser found in ${file}`);
    }
  }
  for (const file of cssFiles) {
    cssGzipBytes += gzipSync(
      await readFile(path.join(distDir, 'assets', file)),
    ).byteLength;
  }
  if (jsGzipBytes > 102_400) errors.push(`JavaScript gzip ${jsGzipBytes} > 102400`);
  if (cssGzipBytes > 15_360) errors.push(`CSS gzip ${cssGzipBytes} > 15360`);

  const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
  if (hasAbsoluteAssetPath(html)) {
    errors.push('GitHub Pages assets must use relative paths');
  }
  return { jsGzipBytes, cssGzipBytes, errors };
}

if (
  process.argv[1] !== undefined
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const report = await inspectBundle('dist');
  console.log(`JavaScript gzip: ${report.jsGzipBytes} bytes`);
  console.log(`CSS gzip: ${report.cssGzipBytes} bytes`);
  for (const error of report.errors) console.error(error);
  if (report.errors.length > 0) process.exitCode = 1;
}
