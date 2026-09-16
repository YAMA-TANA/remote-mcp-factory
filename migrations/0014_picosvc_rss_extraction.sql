ALTER TABLE rss_feeds ADD COLUMN item_selector TEXT;
ALTER TABLE rss_feeds ADD COLUMN title_selector TEXT;
ALTER TABLE rss_feeds ADD COLUMN link_selector TEXT;
ALTER TABLE rss_feeds ADD COLUMN content_selector TEXT;
ALTER TABLE rss_feeds ADD COLUMN date_selector TEXT;

CREATE INDEX IF NOT EXISTS idx_rss_entries_feed_guid
  ON rss_entries(feed_id, guid);
