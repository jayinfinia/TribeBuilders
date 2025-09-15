-- Updated schema with minor improvements
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP
);

-- Artist profiles
CREATE TABLE artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    artist_name VARCHAR(255) NOT NULL,
    real_name VARCHAR(255),
    bio TEXT,
    genre VARCHAR(100),
    location VARCHAR(255),
    website_url VARCHAR(500),
    spotify_artist_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Persona data storage
CREATE TABLE artist_personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    persona_name VARCHAR(255) NOT NULL DEFAULT 'Main Persona',
    description TEXT,
    tone VARCHAR(50), -- casual, professional, edgy, etc.
    target_audience TEXT,
    key_themes TEXT[], -- array of themes
    voice_characteristics JSONB, -- JSON for flexible voice traits
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Persona questionnaire responses
CREATE TABLE persona_questionnaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID REFERENCES artist_personas(id) ON DELETE CASCADE,
    question_key VARCHAR(100) NOT NULL,
    question_text TEXT NOT NULL,
    answer_text TEXT,
    answer_type VARCHAR(50), -- text, multiple_choice, scale, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interview/podcast transcript analysis
CREATE TABLE persona_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID REFERENCES artist_personas(id) ON DELETE CASCADE,
    transcript_text TEXT NOT NULL,
    source_url VARCHAR(500),
    source_type VARCHAR(50), -- podcast, interview, etc.
    analysis_results JSONB, -- AI analysis results
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content templates and generation history
CREATE TABLE content_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(255) NOT NULL,
    template_type VARCHAR(50), -- announcement, release, news, etc.
    template_content TEXT NOT NULL,
    variables JSONB, -- template variables and defaults
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Generated content
CREATE TABLE generated_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    persona_id UUID REFERENCES artist_personas(id),
    template_id UUID REFERENCES content_templates(id),
    content_type VARCHAR(50), -- text, image, video, audio
    content_text TEXT,
    content_metadata JSONB, -- file paths, dimensions, etc.
    generation_params JSONB, -- AI parameters used
    approval_status VARCHAR(50) DEFAULT 'draft', -- draft, approved, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social media account connections
CREATE TABLE social_media_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- instagram, tiktok, twitter, reddit
    platform_user_id VARCHAR(255),
    platform_username VARCHAR(255),
    access_token_encrypted TEXT, -- OAuth tokens (encrypted)
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMP,
    connection_status VARCHAR(50) DEFAULT 'active', -- active, expired, revoked
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(artist_id, platform)
);

-- Published content tracking
CREATE TABLE published_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generated_content_id UUID REFERENCES generated_content(id),
    social_media_account_id UUID REFERENCES social_media_accounts(id),
    platform_post_id VARCHAR(255), -- ID from the social platform
    published_at TIMESTAMP,
    post_url VARCHAR(500),
    post_status VARCHAR(50), -- published, failed, deleted
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics data storage (for Team Delta)
CREATE TABLE content_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    published_content_id UUID REFERENCES published_content(id),
    metric_name VARCHAR(100), -- likes, shares, comments, views, etc.
    metric_value BIGINT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    platform VARCHAR(50)
);

-- Spotify listener tracking
CREATE TABLE spotify_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    metric_type VARCHAR(100), -- monthly_listeners, followers, streams
    metric_value BIGINT,
    track_id VARCHAR(255), -- Spotify track ID if applicable
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--CREATE TABLE public.artist_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  artist_id UUID REFERENCES public.artists(id) ON DELETE CASCADE,
  persona_name TEXT NOT NULL,
  description TEXT,
  tone TEXT,
  target_audience TEXT,
  key_themes TEXT[],
  voice_characteristics JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.questionnaire_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES public.artist_personas(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  question_text TEXT,
  answer_text TEXT,
  answer_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_persona_question UNIQUE (persona_id, question_key)
);





-- Performance indexes
CREATE INDEX idx_artists_user_id ON artists(user_id);
CREATE INDEX idx_artist_personas_artist_id ON artist_personas(artist_id);
CREATE INDEX idx_generated_content_artist_id ON generated_content(artist_id);
CREATE INDEX idx_generated_content_created_at ON generated_content(created_at);
CREATE INDEX idx_published_content_generated_content_id ON published_content(generated_content_id);
CREATE INDEX idx_content_analytics_published_content_id ON content_analytics(published_content_id);
CREATE INDEX idx_content_analytics_recorded_at ON content_analytics(recorded_at);
CREATE INDEX idx_spotify_analytics_artist_id ON spotify_analytics(artist_id);
CREATE INDEX idx_spotify_analytics_recorded_at ON spotify_analytics(recorded_at);

-- Update triggers for updated_at fields
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artists_updated_at BEFORE UPDATE ON artists
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artist_personas_updated_at BEFORE UPDATE ON artist_personas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_content_updated_at BEFORE UPDATE ON generated_content
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_media_accounts_updated_at BEFORE UPDATE ON social_media_accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();