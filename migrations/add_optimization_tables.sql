-- 创建简历评估记录表
CREATE TABLE IF NOT EXISTS resume_evaluation_records (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  resume_id INTEGER NOT NULL,
  position_id INTEGER NOT NULL,
  
  -- AI 评估结果
  ai_match_score INTEGER NOT NULL CHECK (ai_match_score >= 0 AND ai_match_score <= 100),
  ai_evaluation JSONB,
  
  -- 面试官实际评价
  interview_scores JSONB,
  final_decision TEXT NOT NULL CHECK (final_decision IN ('hired', 'rejected', 'pending')),
  decision_reason TEXT,
  decision_made_by INTEGER,
  
  -- 差异分析
  prediction_error INTEGER,
  is_misclassified BOOLEAN DEFAULT FALSE,
  misclassification_type TEXT CHECK (misclassification_type IN ('false_positive', 'false_negative')),
  
  -- 时间戳
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decision_made_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_resume_evaluation_records_candidate_id ON resume_evaluation_records(candidate_id);
CREATE INDEX IF NOT EXISTS idx_resume_evaluation_records_resume_id ON resume_evaluation_records(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_evaluation_records_position_id ON resume_evaluation_records(position_id);
CREATE INDEX IF NOT EXISTS idx_resume_evaluation_records_final_decision ON resume_evaluation_records(final_decision);
CREATE INDEX IF NOT EXISTS idx_resume_evaluation_records_is_misclassified ON resume_evaluation_records(is_misclassified);
CREATE INDEX IF NOT EXISTS idx_resume_evaluation_records_evaluated_at ON resume_evaluation_records(evaluated_at);

-- 创建模型优化历史表
CREATE TABLE IF NOT EXISTS model_optimization_history (
  id SERIAL PRIMARY KEY,
  
  -- 优化前状态
  old_prompt TEXT NOT NULL,
  old_weights JSONB NOT NULL,
  old_accuracy JSONB NOT NULL,
  
  -- 优化后状态
  new_prompt TEXT NOT NULL,
  new_weights JSONB NOT NULL,
  new_accuracy JSONB NOT NULL,
  
  -- 优化指标
  accuracy_improvement JSONB,
  sample_size INTEGER NOT NULL,
  time_range JSONB NOT NULL,
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deployed', 'rolled_back')),
  deployed_at TIMESTAMP,
  
  -- 元数据
  optimization_method TEXT NOT NULL CHECK (optimization_method IN ('few_shot', 'weight_adjustment', 'hybrid')),
  notes TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_model_optimization_history_status ON model_optimization_history(status);
CREATE INDEX IF NOT EXISTS idx_model_optimization_history_created_at ON model_optimization_history(created_at DESC);

-- 添加注释
COMMENT ON TABLE resume_evaluation_records IS '简历评估记录表，用于动态调整模型';
COMMENT ON TABLE model_optimization_history IS '模型优化历史表，记录每次优化的详细信息';

COMMENT ON COLUMN resume_evaluation_records.ai_match_score IS 'AI给出的匹配度分数 (0-100)';
COMMENT ON COLUMN resume_evaluation_records.ai_evaluation IS 'AI完整评估结果JSON';
COMMENT ON COLUMN resume_evaluation_records.interview_scores IS '面试官各维度评分JSON';
COMMENT ON COLUMN resume_evaluation_records.final_decision IS '最终决策: hired=录用, rejected=淘汰, pending=待定';
COMMENT ON COLUMN resume_evaluation_records.prediction_error IS '预测误差: |aiMatchScore - actualScore|';
COMMENT ON COLUMN resume_evaluation_records.is_misclassified IS '是否误判: false_positive=高分被拒, false_negative=低分被录';

COMMENT ON COLUMN model_optimization_history.optimization_method IS '优化方法: few_shot=少样本学习, weight_adjustment=权重调整, hybrid=混合方法';
