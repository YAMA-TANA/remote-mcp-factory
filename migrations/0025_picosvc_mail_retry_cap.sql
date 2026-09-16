-- Defend the pay-per-delivery retry cap at the database boundary as well as the API.
CREATE TRIGGER IF NOT EXISTS trg_mail_retry_cap
BEFORE UPDATE OF attempts ON mail_events
WHEN NEW.attempts > 4
BEGIN
  SELECT RAISE(ABORT, 'Mail delivery attempt limit exceeded');
END;
