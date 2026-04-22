-- 创建全AI面试配置表
CREATE TABLE IF NOT EXISTS full_ai_interview_configs (
  id SERIAL PRIMARY KEY,
  link_id TEXT NOT NULL UNIQUE,
  candidate_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  position TEXT NOT NULL,
  resume JSONB,
  interview_time TEXT,
  interviewer_voice TEXT NOT NULL DEFAULT 'steady_professional',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建全AI面试结果表
CREATE TABLE IF NOT EXISTS full_ai_interview_results (
  id SERIAL PRIMARY KEY,
  link_id TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  position TEXT NOT NULL,
  evaluation JSONB NOT NULL,
  recording_key TEXT,
  recording_url TEXT,
  completed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_full_ai_interview_configs_link_id ON full_ai_interview_configs(link_id);
CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_interview_id ON full_ai_interview_results(interview_id);
CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_link_id ON full_ai_interview_results(link_id);
CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_completed_at ON full_ai_interview_results(completed_at);

-- 创建全AI面试会话表（用于存储面试过程中的临时数据）
CREATE TABLE IF NOT EXISTS full_ai_interviews (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  position TEXT NOT NULL,
  resume JSONB,
  evaluation JSONB,
  recording_file_key TEXT,
  recording_file_size INTEGER,
  recording_uploaded_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_full_ai_interviews_id ON full_ai_interviews(id);
CREATE INDEX IF NOT EXISTS idx_full_ai_interviews_link_id ON full_ai_interviews(link_id);
CREATE INDEX IF NOT EXISTS idx_full_ai_interviews_status ON full_ai_interviews(status);
