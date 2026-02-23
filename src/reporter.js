/**
 * millie_mini_reports - Reporter
 *
 * 1. Fetch unprocessed articles from original_articles
 * 2. Group by category
 * 3. Use OpenAI to synthesize into reports
 * 4. Insert into reports table
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Supabase setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// OpenAI client (initialized after fetching key from DB)
let openai = null;

// Category definitions - AI will pick the best subcategory
const CATEGORIES = {
  technology: ['ai', 'robots', 'drones', 'computers', 'devices', 'gaming', 'software', 'hardware', 'crypto', 'startups'],
  business: ['markets', 'finance', 'startups', 'crypto', 'real estate', 'economy'],
  politics: ['us', 'world', 'elections', 'policy'],
  science: ['space', 'environment', 'biology', 'physics', 'chemistry', 'research'],
  health: ['medicine', 'fitness', 'nutrition', 'mental health', 'research'],
  sports: ['football', 'basketball', 'soccer', 'baseball', 'olympics', 'esports', 'mma', 'tennis'],
  entertainment: ['movies', 'tv', 'music', 'gaming', 'celebrities', 'streaming'],
  lifestyle: ['food', 'travel', 'fashion', 'home', 'relationships'],
  weather: ['forecast', 'storms', 'climate'],
  kids: ['animals', 'science', 'games', 'stories', 'learning']
};

/**
 * Get OpenAI API key from service_config table
 */
async function getOpenAIKey() {
  const { data, error } = await supabase
    .from('service_config')
    .select('api_key')
    .eq('service_name', 'openai')
    .eq('is_active', true)
    .single();

  if (error || !data?.api_key) {
    console.error('Failed to get OpenAI key from database:', error?.message);
    return null;
  }

  return data.api_key;
}

/**
 * Generate a report from a single article (with optional context from related articles)
 */
async function generateReport(mainArticle, relatedArticles, category) {
  // Main article content
  const mainContent = `MAIN STORY: "${mainArticle.title}"\n${mainArticle.content.substring(0, 3000)}`;

  // Related articles for context (if any)
  let contextSection = '';
  if (relatedArticles && relatedArticles.length > 0) {
    const relatedSummaries = relatedArticles.slice(0, 3).map((a, i) =>
      `Related ${i + 1}: "${a.title}" - ${a.content.substring(0, 500)}`
    ).join('\n\n');
    contextSection = `\n\nRELATED CONTEXT (use if helpful):\n${relatedSummaries}`;
  }

  // Get subcategory options for this category
  const subcategoryOptions = CATEGORIES[category.toLowerCase()] || [];
  const subcategoryList = subcategoryOptions.length > 0
    ? `\nPick the most appropriate subcategory from: ${subcategoryOptions.join(', ')}`
    : '';

  const prompt = `You are an exciting storyteller for a personal AI assistant. Your job is to turn a news article into an engaging, fun-to-listen-to story.

Think of this like an AI tweet that got expanded - punchy, interesting, makes people want to keep listening!

Category: ${category}${subcategoryList}

${mainContent}${contextSection}

Write a report that:
1. Has a catchy, attention-grabbing title (max 80 chars) - make it pop!
2. Has a 1-2 sentence "hook" summary for text-to-speech - this is what gets announced, make it exciting!
3. Tells the story in 2-3 paragraphs - be factual but make it sound like you're telling a friend about something fascinating you just learned
4. Uses a conversational, energetic tone - not dry news speak
5. Can reference related articles for context if they add to the story

DO NOT make anything up. Stick to the facts but present them in an engaging way.

Respond in this exact JSON format:
{
  "title": "Catchy title here",
  "summary": "Exciting 1-2 sentence hook for TTS",
  "content": "The full engaging story...",
  "subcategory": "picked_subcategory",
  "topics": ["keyword1", "keyword2", "keyword3"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an enthusiastic storyteller who makes news exciting. Always respond with valid JSON. Never fabricate facts.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    console.error('OpenAI error:', err.message);
    return null;
  }
}

/**
 * Process articles - one report per article
 */
async function processArticles() {
  // Get unprocessed articles from last 24 hours (limit 50)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: articles, error } = await supabase
    .from('original_articles')
    .select('*')
    .eq('processed', false)
    .gte('scraped_at', oneDayAgo)
    .order('scraped_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to fetch articles:', error.message);
    return;
  }

  if (!articles || articles.length === 0) {
    console.log('No unprocessed articles found');
    return;
  }

  console.log(`Found ${articles.length} unprocessed articles`);

  // Group by category for finding related articles
  const byCategory = {};
  for (const article of articles) {
    const key = article.category.toLowerCase();
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(article);
  }

  console.log(`Processing ${articles.length} articles (1 report each)\n`);

  // Generate one report per article
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const category = article.category.toLowerCase();

    // Find related articles in same category (excluding this one)
    const relatedArticles = (byCategory[category] || [])
      .filter(a => a.id !== article.id);

    console.log(`[${i + 1}/${articles.length}] "${article.title.substring(0, 50)}..."`);

    const report = await generateReport(article, relatedArticles, article.category);

    if (!report) {
      console.log('  ✗ Failed to generate report');
      failCount++;
      continue;
    }

    // Insert report with original article's published_at, url, and image
    const { error: insertError } = await supabase
      .from('reports')
      .insert({
        title: report.title,
        summary: report.summary,
        content: report.content,
        category: category,
        subcategory: report.subcategory || null,
        topics: report.topics || [],
        source_article_ids: [article.id],
        published_at: article.published_at || article.scraped_at,
        source_url: article.url,
        image_url: article.image_url || null
      });

    if (insertError) {
      console.log(`  ✗ Insert error: ${insertError.message}`);
      failCount++;
    } else {
      console.log(`  ✓ [${report.subcategory || 'general'}] "${report.title.substring(0, 45)}..."`);
      successCount++;

      // Mark article as processed
      await supabase
        .from('original_articles')
        .update({ processed: true })
        .eq('id', article.id);
    }
  }

  console.log(`\n✓ ${successCount} reports created, ${failCount} failed`);
}

/**
 * Main entry point
 */
async function main() {
  console.log('========================================');
  console.log('millie_mini_reports - Reporter');
  console.log('========================================');

  // Get OpenAI key from database
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    console.error('Cannot proceed without OpenAI API key');
    process.exit(1);
  }

  openai = new OpenAI({ apiKey });
  console.log('OpenAI client initialized from database config');

  await processArticles();

  console.log('\n========================================');
  console.log('Reporting complete!');
  console.log('========================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
