/**
 * Feed URL Tester
 * Tests RSS feeds individually to verify they work before enabling
 *
 * Usage:
 *   npm run test-feeds           # Test all feeds in database
 *   npm run test-feeds <url>     # Test a specific URL
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const parser = new Parser({
  timeout: 10000, // 10 second timeout
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; MillieMini/1.0; +https://milliemini.com)'
  }
});

/**
 * Test a single feed URL
 */
async function testFeed(url, name = 'Unknown') {
  const result = {
    url,
    name,
    success: false,
    itemCount: 0,
    latestItem: null,
    error: null
  };

  try {
    console.log(`\n🔍 Testing: ${name}`);
    console.log(`   URL: ${url}`);

    const feed = await parser.parseURL(url);

    result.success = true;
    result.itemCount = feed.items?.length || 0;

    if (feed.items && feed.items.length > 0) {
      const latest = feed.items[0];
      result.latestItem = {
        title: latest.title?.substring(0, 60) + (latest.title?.length > 60 ? '...' : ''),
        pubDate: latest.pubDate || latest.isoDate || 'No date',
        link: latest.link
      };
    }

    console.log(`   ✅ SUCCESS - ${result.itemCount} items`);
    if (result.latestItem) {
      console.log(`   📰 Latest: "${result.latestItem.title}"`);
      console.log(`   📅 Date: ${result.latestItem.pubDate}`);
    }

  } catch (error) {
    result.error = error.message;
    console.log(`   ❌ FAILED: ${error.message}`);
  }

  return result;
}

/**
 * Test all feeds in database
 */
async function testAllFeeds() {
  console.log('========================================');
  console.log('Feed URL Tester');
  console.log('========================================');

  // Fetch all news sources
  const { data: sources, error } = await supabase
    .from('news_sources')
    .select('*')
    .order('category', { ascending: true });

  if (error) {
    console.error('Failed to fetch news sources:', error.message);
    process.exit(1);
  }

  console.log(`\nFound ${sources.length} feeds in database\n`);

  const results = {
    active: { success: [], failed: [] },
    inactive: { success: [], failed: [] }
  };

  // Group by active status
  const activeFeeds = sources.filter(s => s.active);
  const inactiveFeeds = sources.filter(s => !s.active);

  // Test active feeds first
  if (activeFeeds.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`ACTIVE FEEDS (${activeFeeds.length})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const source of activeFeeds) {
      const result = await testFeed(source.feed_url, `${source.name} [${source.category}]`);
      if (result.success) {
        results.active.success.push({ ...source, ...result });
      } else {
        results.active.failed.push({ ...source, ...result });
      }
    }
  }

  // Test inactive feeds
  if (inactiveFeeds.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`INACTIVE FEEDS (${inactiveFeeds.length})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const source of inactiveFeeds) {
      const result = await testFeed(source.feed_url, `${source.name} [${source.category}]`);
      if (result.success) {
        results.inactive.success.push({ ...source, ...result });
      } else {
        results.inactive.failed.push({ ...source, ...result });
      }
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');

  console.log(`\n📊 Active Feeds: ${activeFeeds.length}`);
  console.log(`   ✅ Working: ${results.active.success.length}`);
  console.log(`   ❌ Failed: ${results.active.failed.length}`);

  console.log(`\n📊 Inactive Feeds: ${inactiveFeeds.length}`);
  console.log(`   ✅ Working: ${results.inactive.success.length}`);
  console.log(`   ❌ Failed: ${results.inactive.failed.length}`);

  // Show failed feeds
  const allFailed = [...results.active.failed, ...results.inactive.failed];
  if (allFailed.length > 0) {
    console.log('\n⚠️  FAILED FEEDS:');
    for (const feed of allFailed) {
      console.log(`   - ${feed.name}: ${feed.error}`);
    }
  }

  // Show inactive but working (ready to enable)
  if (results.inactive.success.length > 0) {
    console.log('\n✅ READY TO ENABLE (inactive but working):');
    for (const feed of results.inactive.success) {
      console.log(`   - ${feed.name} [${feed.category}] - ${feed.itemCount} items`);
    }
  }

  // Category coverage
  console.log('\n📁 CATEGORY COVERAGE:');
  const categories = {};
  for (const source of sources) {
    if (!categories[source.category]) {
      categories[source.category] = { active: 0, inactive: 0, total: 0 };
    }
    categories[source.category].total++;
    if (source.active) {
      categories[source.category].active++;
    } else {
      categories[source.category].inactive++;
    }
  }

  for (const [cat, counts] of Object.entries(categories).sort()) {
    const status = counts.active > 0 ? '✅' : '❌';
    console.log(`   ${status} ${cat}: ${counts.active}/${counts.total} active`);
  }

  return results;
}

/**
 * Test a single URL from command line
 */
async function testSingleUrl(url) {
  console.log('========================================');
  console.log('Testing Single Feed URL');
  console.log('========================================');

  const result = await testFeed(url, 'Manual Test');

  if (result.success) {
    console.log('\n✅ Feed is valid and working!');
    console.log(`   Items available: ${result.itemCount}`);
  } else {
    console.log('\n❌ Feed test failed');
    console.log(`   Error: ${result.error}`);
  }
}

// Main
const args = process.argv.slice(2);
if (args.length > 0 && args[0].startsWith('http')) {
  testSingleUrl(args[0]);
} else {
  testAllFeeds();
}
