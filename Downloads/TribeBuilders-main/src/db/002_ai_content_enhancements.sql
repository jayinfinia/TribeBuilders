-- Week 3 AI Content Generation Enhancements
-- Run this after 001_initial_schema.sql

-- Add indexes for content generation performance
CREATE INDEX IF NOT EXISTS idx_generated_content_persona_id ON generated_content(persona_id);
CREATE INDEX IF NOT EXISTS idx_generated_content_approval_status ON generated_content(approval_status);
CREATE INDEX IF NOT EXISTS idx_generated_content_content_type ON generated_content(content_type);

-- Add unique constraint for template names
ALTER TABLE content_templates 
ADD CONSTRAINT unique_template_name UNIQUE (template_name);

-- Add updated_at column to content_templates if not exists
ALTER TABLE content_templates 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create AI generation logs table for monitoring and debugging
CREATE TABLE ai_generation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    persona_id UUID REFERENCES artist_personas(id) ON DELETE CASCADE,
    request_type VARCHAR(50) NOT NULL, -- 'content_generation', 'quality_scoring', 'template_processing'
    ai_model VARCHAR(100), -- 'huggingface', 'openai', etc.
    input_params JSONB,
    output_data JSONB,
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create content performance metrics table
CREATE TABLE content_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generated_content_id UUID REFERENCES generated_content(id) ON DELETE CASCADE,
    metric_type VARCHAR(50), -- 'quality_score', 'engagement_rate', 'click_through_rate'
    metric_value DECIMAL(5,4),
    measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    platform VARCHAR(50), -- 'instagram', 'twitter', 'tiktok', etc.
    additional_data JSONB
);

-- Create AI model cache table for performance optimization  
CREATE TABLE ai_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    cache_data JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add cache cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM ai_cache WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for new tables
CREATE INDEX idx_ai_generation_logs_artist_id ON ai_generation_logs(artist_id);
CREATE INDEX idx_ai_generation_logs_created_at ON ai_generation_logs(created_at);
CREATE INDEX idx_ai_generation_logs_success ON ai_generation_logs(success);
CREATE INDEX idx_content_performance_content_id ON content_performance(generated_content_id);
CREATE INDEX idx_content_performance_measured_at ON content_performance(measured_at);
CREATE INDEX idx_ai_cache_key ON ai_cache(cache_key);
CREATE INDEX idx_ai_cache_expires_at ON ai_cache(expires_at);

-- Add trigger for template updated_at
CREATE OR REPLACE FUNCTION update_template_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_content_templates_updated_at 
BEFORE UPDATE ON content_templates
FOR EACH ROW EXECUTE FUNCTION update_template_updated_at_column();

-- Insert some performance metrics for existing content (if any)
INSERT INTO content_performance (generated_content_id, metric_type, metric_value, platform)
SELECT 
    id, 
    'quality_score', 
    CAST(content_metadata->>'quality_score' AS DECIMAL(5,4)), 
    'system'
FROM generated_content 
WHERE content_metadata->>'quality_score' IS NOT NULL
ON CONFLICT DO NOTHING;

-- Create view for content analytics
CREATE OR REPLACE VIEW content_analytics_summary AS
SELECT 
    a.artist_name,
    gc.content_type,
    COUNT(*) as total_generated,
    AVG(CAST(gc.content_metadata->>'quality_score' AS DECIMAL(5,4))) as avg_quality_score,
    COUNT(CASE WHEN gc.approval_status = 'approved' THEN 1 END) as approved_count,
    MAX(gc.created_at) as last_generated
FROM generated_content gc
JOIN artists a ON gc.artist_id = a.id
WHERE gc.content_metadata->>'quality_score' IS NOT NULL
GROUP BY a.artist_name, gc.content_type;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;