-- rich-sim 漏斗事件表：只存事件名与时间，不存 props、不存 IP、不存任何标识。
-- 见 workers/analytics-collector/src/index.ts 开头的三条理由。
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  day TEXT NOT NULL,
  event TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_day_event ON events (day, event);
