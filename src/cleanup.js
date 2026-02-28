/**
 * Cleanup script - removes expired reports from the database
 *
 * This calls the cleanup_expired_reports() function which:
 * - Deletes unsaved reports older than 48 hours
 * - Deletes ALL reports (even saved) older than 30 days
 * - Also cleans up original_articles older than 7 days
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runCleanup() {
  console.log('Starting database cleanup...');

  // Cleanup expired reports
  const { data: reportsDeleted, error: reportsError } = await supabase
    .rpc('cleanup_expired_reports');

  if (reportsError) {
    console.error('Error cleaning up reports:', reportsError.message);
  } else {
    console.log(`Cleaned up ${reportsDeleted ?? 0} expired reports`);
  }

  // Cleanup old original articles
  const { data: articlesDeleted, error: articlesError } = await supabase
    .rpc('cleanup_old_original_articles');

  if (articlesError) {
    // Function might not exist, that's okay
    if (articlesError.message.includes('does not exist')) {
      console.log('cleanup_old_original_articles function not found, skipping');
    } else {
      console.error('Error cleaning up articles:', articlesError.message);
    }
  } else {
    console.log(`Cleaned up ${articlesDeleted ?? 0} old articles`);
  }

  console.log('Cleanup complete');
}

runCleanup().catch(console.error);
