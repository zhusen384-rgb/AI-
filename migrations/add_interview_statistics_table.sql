-- 创建全AI面试统计表
CREATE TABLE IF NOT EXISTS full_ai_interview_statistics (
    id SERIAL PRIMARY KEY,
    link_id VARCHAR(255) NOT NULL,
    interview_id VARCHAR(255) NOT NULL,
    candidate_name VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    interview_time TIMESTAMP NOT NULL,
    meeting_link VARCHAR(255) NOT NULL,
    meeting_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_interview_statistics_link_id ON full_ai_interview_statistics(link_id);
CREATE INDEX IF NOT EXISTS idx_interview_statistics_candidate_name ON full_ai_interview_statistics(candidate_name);
CREATE INDEX IF NOT EXISTS idx_interview_statistics_interview_time ON full_ai_interview_statistics(interview_time);
