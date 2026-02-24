/**
 * millie_mini_reports - Scraper
 *
 * 1. Fetch active news sources from Supabase
 * 2. Parse RSS feeds
 * 3. Extract full article text using Readability
 * 4. Insert into original_articles table
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// Supabase setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const parser = new Parser();

// Rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Only grab articles from last 6 hours
const SIX_HOURS_AGO = new Date(Date.now() - 6 * 60 * 60 * 1000);

/**
 * Extract full article text and featured image from URL using Readability
 * Returns { content, imageUrl }
 */
async function extractArticle(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MillieMiniBot/1.0)'
      }
    });

    if (!res.ok) {
      console.log(`  ⚠ HTTP ${res.status} for ${url}`);
      return { content: null, imageUrl: null };
    }

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Extract og:image (featured image for social sharing)
    let imageUrl = doc.querySelector('meta[property="og:image"]')?.content
      || doc.querySelector('meta[name="twitter:image"]')?.content
      || null;

    // Parse article content
    const reader = new Readability(doc);
    const article = reader.parse();

    return {
      content: article?.textContent || null,
      imageUrl: imageUrl
    };
  } catch (err) {
    console.log(`  ⚠ Failed to extract: ${url}`, err.message);
    return { content: null, imageUrl: null };
  }
}

/**
 * Process a single RSS feed
 */
async function processFeed(source) {
  console.log(`\n→ Processing: ${source.name}`);

  try {
    const feed = await parser.parseURL(source.feed_url);
    console.log(`  Found ${feed.items.length} items in feed`);

    let inserted = 0;
    let skippedOld = 0;

    for (const item of feed.items) {
      const url = item.link;
      if (!url) continue;

      // Skip articles older than 6 hours
      const pubDate = new Date(item.isoDate || item.pubDate);
      if (pubDate < SIX_HOURS_AGO) {
        skippedOld++;
        continue;
      }

      // Check for duplicate
      const { data: existing } = await supabase
        .from('original_articles')
        .select('id')
        .eq('url', url)
        .single();

      if (existing) {
        continue; // Already have this article
      }

      // Extract article content and image
      const { content, imageUrl } = await extractArticle(url);
      if (!content || content.length < 100) {
        console.log(`  ⚠ Skipped (too short): ${item.title?.substring(0, 50)}`);
        continue;
      }

      // Insert article
      const { error } = await supabase
        .from('original_articles')
        .insert({
          title: item.title || 'Untitled',
          content: content,
          url: url,
          author: item.creator || item.author || null,
          source_id: source.id,
          source_name: source.name,
          category: source.category,
          subcategory: source.subcategory || null,
          published_at: item.isoDate || item.pubDate || null,
          image_url: imageUrl,
          processed: false
        });

      if (error) {
        if (error.code === '23505') {
          // Duplicate URL - ignore
        } else {
          console.log(`  ✗ Insert error: ${error.message}`);
        }
      } else {
        inserted++;
        console.log(`  ✓ ${item.title?.substring(0, 60)}`);
      }

      await sleep(500); // Be polite
    }

    console.log(`  → Inserted ${inserted} new, skipped ${skippedOld} older than 6hrs`);

  } catch (err) {
    console.log(`  ✗ Feed error: ${err.message}`);
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('========================================');
  console.log('millie_mini_reports - Scraper');
  console.log('========================================');

  // Get active news sources
  const { data: sources, error } = await supabase
    .from('news_sources')
    .select('*')
    .eq('active', true);

  if (error) {
    console.error('Failed to fetch sources:', error.message);
    process.exit(1);
  }

  console.log(`Found ${sources.length} active sources`);

  // Process each feed
  for (const source of sources) {
    await processFeed(source);
    await sleep(1000); // Rate limit between feeds
  }

  console.log('\n========================================');
  console.log('Scraping complete!');
  console.log('========================================');
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
