/**
 * Reset all articles to unprocessed
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { error } = await supabase
  .from('original_articles')
  .update({ processed: false })
  .eq('processed', true);

console.log(error ? 'Error: ' + error.message : '✓ Reset all articles to unprocessed');
