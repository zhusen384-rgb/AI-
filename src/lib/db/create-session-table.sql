-- 创建面试会话表
CREATE TABLE IF NOT EXISTS interview_sessions (
  id SERIAL PRIMARY KEY,
  interview_id TEXT NOT NULL UNIQUE,
  link_id TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  position TEXT NOT NULL,
  position_id TEXT NOT NULL,
  resume TEXT NOT NULL,
  messages JSONB NOT NULL,
  interview_stage INTEGER NOT NULL DEFAULT 1,
  follow_up_count INTEGER NOT NULL DEFAULT 0,
  current_question_count INTEGER NOT NULL DEFAULT 0,
  start_time TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_interview_sessions_interview_id ON interview_sessions(interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_link_id ON interview_sessions(link_id);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_interview_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_update_interview_sessions_updated_at
  BEFORE UPDATE ON interview_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_interview_sessions_updated_at();
