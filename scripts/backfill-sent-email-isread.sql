-- One-time data fix: Email rows created before the isRead-on-send fix always defaulted to
-- isRead=false, even for emails we sent ourselves. Naturally idempotent — once fixed, the
-- WHERE clause matches nothing on later boots.
UPDATE "Email" SET "isRead" = true WHERE "direction" = 'SENT' AND "isRead" = false;
