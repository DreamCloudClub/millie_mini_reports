/**
 * Feed Manager
 * Enable/disable feeds, add new feeds, list status
 *
 * Usage:
 *   npm run manage-feeds list                    # List all feeds
 *   npm run manage-feeds enable <id|name>        # Enable a feed
 *   npm run manage-feeds disable <id|name>       # Disable a feed
 *   npm run manage-feeds enable-category <cat>   # Enable all in category
 *   npm run manage-feeds disable-all             # Disable all feeds
 *   npm run manage-feeds add <name> <url> <cat>  # Add new feed
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// UUID regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * List all feeds with status
 */
async function listFeeds() {
  const { data: sources, error } = await supabase
    .from('news_sources')
    .select('*')
    .order('category')
    .order('name');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('\n📰 NEWS FEEDS\n');
  console.log('ID                                   | Status | Category      | Name');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let currentCategory = '';
  for (const source of sources) {
    if (source.category !== currentCategory) {
      currentCategory = source.category;
      console.log('');
    }
    const status = source.active ? '✅ ON ' : '❌ OFF';
    const cat = source.category.padEnd(13);
    console.log(`${source.id} | ${status} | ${cat} | ${source.name}`);
  }

  // Summary
  const active = sources.filter(s => s.active).length;
  console.log(`\n📊 Total: ${sources.length} feeds (${active} active, ${sources.length - active} inactive)`);
}

/**
 * Enable a feed by ID or name
 */
async function enableFeed(identifier) {
  let query = supabase
    .from('news_sources')
    .update({ active: true, updated_at: new Date().toISOString() });

  // Check if identifier looks like a UUID
  if (UUID_REGEX.test(identifier)) {
    query = query.eq('id', identifier);
  } else {
    query = query.ilike('name', `%${identifier}%`);
  }

  const { data, error } = await query.select();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (data.length === 0) {
    console.log(`❌ No feed found matching: ${identifier}`);
  } else {
    for (const feed of data) {
      console.log(`✅ Enabled: ${feed.name} [${feed.category}]`);
    }
  }
}

/**
 * Disable a feed by ID or name
 */
async function disableFeed(identifier) {
  let query = supabase
    .from('news_sources')
    .update({ active: false, updated_at: new Date().toISOString() });

  // Check if identifier looks like a UUID
  if (UUID_REGEX.test(identifier)) {
    query = query.eq('id', identifier);
  } else {
    query = query.ilike('name', `%${identifier}%`);
  }

  const { data, error } = await query.select();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (data.length === 0) {
    console.log(`❌ No feed found matching: ${identifier}`);
  } else {
    for (const feed of data) {
      console.log(`❌ Disabled: ${feed.name} [${feed.category}]`);
    }
  }
}

/**
 * Enable all feeds in a category
 */
async function enableCategory(category) {
  const { data, error } = await supabase
    .from('news_sources')
    .update({ active: true, updated_at: new Date().toISOString() })
    .ilike('category', category)
    .select();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (data.length === 0) {
    console.log(`❌ No feeds found in category: ${category}`);
  } else {
    console.log(`✅ Enabled ${data.length} feeds in ${category}:`);
    for (const feed of data) {
      console.log(`   - ${feed.name}`);
    }
  }
}

/**
 * Disable all feeds
 */
async function disableAll() {
  const { data, error } = await supabase
    .from('news_sources')
    .update({ active: false, updated_at: new Date().toISOString() })
    .neq('id', '00000000-0000-0000-0000-000000000000') // Match all
    .select();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log(`❌ Disabled all ${data.length} feeds`);
}

/**
 * Add a new feed
 */
async function addFeed(name, url, category, subcategory = null) {
  const { data, error } = await supabase
    .from('news_sources')
    .insert({
      name,
      feed_url: url,
      category: category.toLowerCase(),
      subcategory: subcategory?.toLowerCase(),
      active: false // Start disabled until tested
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      console.log(`❌ Feed URL already exists: ${url}`);
    } else {
      console.error('Error:', error.message);
    }
    return;
  }

  console.log(`✅ Added: ${data.name} [${data.category}]`);
  console.log(`   ID: ${data.id}`);
  console.log(`   Status: DISABLED (test with: npm run test-feeds)`);
}

// Main
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'list':
    listFeeds();
    break;
  case 'enable':
    if (!args[0]) {
      console.log('Usage: npm run manage-feeds enable <id|name>');
    } else {
      enableFeed(args[0]);
    }
    break;
  case 'disable':
    if (!args[0]) {
      console.log('Usage: npm run manage-feeds disable <id|name>');
    } else {
      disableFeed(args[0]);
    }
    break;
  case 'enable-category':
    if (!args[0]) {
      console.log('Usage: npm run manage-feeds enable-category <category>');
    } else {
      enableCategory(args[0]);
    }
    break;
  case 'disable-all':
    disableAll();
    break;
  case 'add':
    if (args.length < 3) {
      console.log('Usage: npm run manage-feeds add <name> <url> <category> [subcategory]');
    } else {
      addFeed(args[0], args[1], args[2], args[3]);
    }
    break;
  default:
    console.log(`
Feed Manager Commands:
  list                    - Show all feeds and status
  enable <id|name>        - Enable a specific feed
  disable <id|name>       - Disable a specific feed
  enable-category <cat>   - Enable all feeds in category
  disable-all             - Disable all feeds
  add <name> <url> <cat>  - Add new feed (starts disabled)

Examples:
  npm run manage-feeds list
  npm run manage-feeds enable TechCrunch
  npm run manage-feeds enable-category technology
  npm run manage-feeds add "CNN Tech" "https://rss.cnn.com/tech" technology
`);
}
