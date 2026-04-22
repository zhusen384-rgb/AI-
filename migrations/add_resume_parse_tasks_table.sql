-- 创建简历批量解析任务表
CREATE TABLE IF NOT EXISTS resume_parse_tasks (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total_count INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    results JSONB NOT NULL DEFAULT '[]',
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_user_id ON resume_parse_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_status ON resume_parse_tasks(status);
CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_created_at ON resume_parse_tasks(created_at);

-- 创建唯一约束：同一用户只有一个有效任务
CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_parse_tasks_unique_user ON resume_parse_tasks(user_id) WHERE status IN ('pending', 'processing');
