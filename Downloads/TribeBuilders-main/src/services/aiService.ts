import { HfInference } from '@huggingface/inference';
import OpenAI from 'openai';
import NodeCache from 'node-cache';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Initialize AI clients
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-testing'
});

// Initialize cache with TTL from environment
const cache = new NodeCache({ 
  stdTTL: parseInt(process.env.AI_CACHE_TTL_SECONDS || '3600'),
  checkperiod: 600 
});

// Rate limiter for AI API calls
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'ai_api',
  points: parseInt(process.env.AI_RATE_LIMIT_REQUESTS_PER_MINUTE || '60'),
  duration: 60, // Per 60 seconds
});

// Content generation interfaces
export interface PersonaData {
  artist_id: any;
  persona_name: any;
  id: string;
  tone: string;
  target_audience: string;
  key_themes: string[];
  voice_characteristics: any;
  questionnaire_responses: any[];
}

export interface ContentTemplate {
  id: string;
  template_name: string;
  template_type: string;
  template_content: string;
  variables: any;
}

export interface ContentGenerationParams {
  persona: PersonaData;
  template?: ContentTemplate;
  content_type: 'announcement' | 'release' | 'news' | 'social_post' | 'story';
  context?: string;
  max_length?: number;
  variations?: number;
}

export interface GeneratedContent {
  content: string;
  quality_score: number;
  variation_id: number;
  generation_params: any;
  model_used: string;
  generated_at: Date;
}

export interface ContentQualityMetrics {
  score: number;
  readability: number;
  engagement_potential: number;
  brand_consistency: number;
  issues: string[];
  suggestions: string[];
}

class AIContentService {
  private cacheKey(prefix: string, data: any): string {
    const hash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex');
    return `${prefix}_${hash}`;
  }

  // Rate limiting wrapper for AI calls
  private async withRateLimit<T>(operation: () => Promise<T>): Promise<T> {
    await rateLimiter.consume('ai_request');
    return operation();
  }

  // Generate persona-consistent content using Hugging Face
  async generateContent(params: ContentGenerationParams): Promise<GeneratedContent[]> {
    const cacheKey = this.cacheKey('content_gen', params);
    const cached = cache.get<GeneratedContent[]>(cacheKey);
    
    if (cached) {
      console.log('Returning cached content generation result');
      return cached;
    }

    try {
      const variations = params.variations || 3;
      const results: GeneratedContent[] = [];

      // Build persona-aware prompt
      const personaPrompt = this.buildPersonaPrompt(params.persona, params.content_type, params.context);

      for (let i = 0; i < variations; i++) {
        const content = await this.withRateLimit(async () => {
          // Use Hugging Face for text generation
          const response = await hf.textGeneration({
            model: process.env.AI_MODEL_TEXT_GENERATION || 'microsoft/DialoGPT-medium',
            inputs: personaPrompt,
            parameters: {
              max_new_tokens: params.max_length || 150,
              temperature: 0.7 + (i * 0.1), // Vary temperature for different outputs
              top_p: 0.9,
              repetition_penalty: 1.2,
              return_full_text: false,
            }
          });

          return response.generated_text?.trim() || '';
        });

        if (content) {
          // Score the generated content
          const qualityScore = await this.scoreContentQuality(content, params.persona);

          results.push({
            content,
            quality_score: qualityScore.score,
            variation_id: i + 1,
            generation_params: {
              model: process.env.AI_MODEL_TEXT_GENERATION,
              temperature: 0.7 + (i * 0.1),
              max_length: params.max_length || 150,
              content_type: params.content_type
            },
            model_used: 'huggingface',
            generated_at: new Date()
          });
        }
      }

      // Sort by quality score (highest first)
      results.sort((a, b) => b.quality_score - a.quality_score);

      // Cache results
      cache.set(cacheKey, results);
      
      return results;

    } catch (error) {
      console.error('Content generation error:', error);
      throw new Error(`AI content generation failed: ${error}`);
    }
  }

  // Generate content using OpenAI (fallback/premium option)
  async generateContentWithOpenAI(params: ContentGenerationParams): Promise<GeneratedContent[]> {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy-key-for-testing') {
      throw new Error('OpenAI API key not configured');
    }

    const cacheKey = this.cacheKey('openai_content_gen', params);
    const cached = cache.get<GeneratedContent[]>(cacheKey);
    
    if (cached) {
      console.log('Returning cached OpenAI content generation result');
      return cached;
    }

    try {
      const variations = params.variations || 3;
      const results: GeneratedContent[] = [];

      const systemPrompt = this.buildSystemPrompt(params.persona);
      const userPrompt = this.buildUserPrompt(params.content_type, params.context);

      for (let i = 0; i < variations; i++) {
        const response = await this.withRateLimit(async () => {
          return await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: params.max_length || 150,
            temperature: 0.7 + (i * 0.1),
            top_p: 0.9,
            frequency_penalty: 0.2,
            presence_penalty: 0.1,
          });
        });

        const content = response.choices[0]?.message?.content?.trim();
        
        if (content) {
          const qualityScore = await this.scoreContentQuality(content, params.persona);

          results.push({
            content,
            quality_score: qualityScore.score,
            variation_id: i + 1,
            generation_params: {
              model: 'gpt-3.5-turbo',
              temperature: 0.7 + (i * 0.1),
              max_tokens: params.max_length || 150,
              content_type: params.content_type
            },
            model_used: 'openai',
            generated_at: new Date()
          });
        }
      }

      // Sort by quality score
      results.sort((a, b) => b.quality_score - a.quality_score);

      // Cache results
      cache.set(cacheKey, results);
      
      return results;

    } catch (error) {
      console.error('OpenAI content generation error:', error);
      throw new Error(`OpenAI content generation failed: ${error}`);
    }
  }

  // Score content quality using AI
  async scoreContentQuality(content: string, persona: PersonaData): Promise<ContentQualityMetrics> {
    const cacheKey = this.cacheKey('quality_score', { content, persona_id: persona.id });
    const cached = cache.get<ContentQualityMetrics>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      // Basic quality metrics
      const metrics: ContentQualityMetrics = {
        score: 0,
        readability: 0,
        engagement_potential: 0,
        brand_consistency: 0,
        issues: [],
        suggestions: []
      };

      // Readability scoring (simple implementation)
      metrics.readability = this.calculateReadabilityScore(content);
      
      // Engagement potential (based on content features)
      metrics.engagement_potential = this.calculateEngagementScore(content);
      
      // Brand consistency (based on persona alignment)
      metrics.brand_consistency = this.calculateBrandConsistencyScore(content, persona);

      // Overall score (weighted average)
      metrics.score = (
        metrics.readability * 0.3 +
        metrics.engagement_potential * 0.4 +
        metrics.brand_consistency * 0.3
      );

      // Generate issues and suggestions
      if (metrics.readability < 0.6) {
        metrics.issues.push('Content may be too complex or difficult to read');
        metrics.suggestions.push('Simplify language and sentence structure');
      }

      if (metrics.engagement_potential < 0.6) {
        metrics.issues.push('Content may not be engaging enough');
        metrics.suggestions.push('Add more emotional language or call-to-action');
      }

      if (metrics.brand_consistency < 0.6) {
        metrics.issues.push('Content may not align well with artist persona');
        metrics.suggestions.push('Review tone and themes to better match artist brand');
      }

      // Cache results
      cache.set(cacheKey, metrics);
      
      return metrics;

    } catch (error) {
      console.error('Content quality scoring error:', error);
      // Return default metrics on error
      return {
        score: 0.5,
        readability: 0.5,
        engagement_potential: 0.5,
        brand_consistency: 0.5,
        issues: ['Unable to analyze content quality'],
        suggestions: ['Manual review recommended']
      };
    }
  }

  // Build persona-aware prompt for content generation
  private buildPersonaPrompt(persona: PersonaData, contentType: string, context?: string): string {
    const themes = persona.key_themes?.join(', ') || 'music, creativity';
    const tone = persona.tone || 'casual';
    
    let prompt = `You are ${persona.target_audience || 'music fans'} writing as an artist. `;
    prompt += `Your tone is ${tone} and your key themes are: ${themes}. `;
    
    switch (contentType) {
      case 'announcement':
        prompt += 'Write an exciting announcement about ';
        break;
      case 'release':
        prompt += 'Write a post announcing a new music release: ';
        break;
      case 'news':
        prompt += 'Share some news with your fans: ';
        break;
      case 'social_post':
        prompt += 'Write a social media post that ';
        break;
      case 'story':
        prompt += 'Tell a brief story about ';
        break;
      default:
        prompt += 'Write content about ';
    }
    
    if (context) {
      prompt += context;
    } else {
      prompt += 'something that would interest your fans';
    }
    
    prompt += '. Keep it authentic and engaging.';
    
    return prompt;
  }

  // Build system prompt for OpenAI
  private buildSystemPrompt(persona: PersonaData): string {
    return `You are an AI assistant helping an artist create social media content. 
    
Artist Details:
- Tone: ${persona.tone || 'casual and friendly'}
- Target Audience: ${persona.target_audience || 'music fans'}
- Key Themes: ${persona.key_themes?.join(', ') || 'music, creativity, life'}

Create content that:
1. Matches the artist's tone and personality
2. Appeals to their target audience
3. Incorporates their key themes naturally
4. Is engaging and authentic
5. Is appropriate for social media platforms

Keep responses concise and impactful.`;
  }

  // Build user prompt for OpenAI
  private buildUserPrompt(contentType: string, context?: string): string {
    const contextText = context || 'something that would interest and engage fans';
    
    switch (contentType) {
      case 'announcement':
        return `Create an exciting announcement post about ${contextText}.`;
      case 'release':
        return `Write a post announcing a new music release: ${contextText}.`;
      case 'news':
        return `Share news with fans about ${contextText}.`;
      case 'social_post':
        return `Create a social media post about ${contextText}.`;
      case 'story':
        return `Tell a brief, engaging story about ${contextText}.`;
      default:
        return `Create engaging content about ${contextText}.`;
    }
  }

  // Simple readability scoring (Flesch Reading Ease approximation)
  private calculateReadabilityScore(content: string): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const words = content.split(/\s+/).filter(w => w.length > 0).length;
    const syllables = this.countSyllables(content);
    
    if (sentences === 0 || words === 0) return 0.5;
    
    const avgSentenceLength = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    
    // Simplified Flesch score (normalized to 0-1)
    const fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
    
    // Normalize to 0-1 range (typical Flesch scores range from 0-100)
    return Math.max(0, Math.min(1, fleschScore / 100));
  }

  // Simple syllable counting
  private countSyllables(text: string): number {
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    let totalSyllables = 0;
    
    for (const word of words) {
      // Simple syllable counting algorithm
      let syllables = word.match(/[aeiouy]+/g)?.length || 1;
      if (word.endsWith('e') && syllables > 1) syllables--;
      totalSyllables += Math.max(1, syllables);
    }
    
    return totalSyllables;
  }

  // Calculate engagement potential based on content features
  private calculateEngagementScore(content: string): number {
    let score = 0.5; // Base score
    
    // Check for engagement indicators
    const engagementIndicators = [
      /[!?]/, // Exclamation or question marks
      /\b(you|your|yours)\b/i, // Direct address
      /\b(amazing|incredible|excited|love|awesome|fantastic)\b/i, // Emotional words
      /\b(new|fresh|latest|upcoming|soon)\b/i, // Urgency/novelty
      /@\w+/, // Mentions
      /#\w+/, // Hashtags
    ];
    
    engagementIndicators.forEach(pattern => {
      if (pattern.test(content)) score += 0.1;
    });
    
    // Length penalty for too long or too short content
    const idealLength = 280; // Tweet-like length
    const lengthRatio = content.length / idealLength;
    if (lengthRatio > 0.3 && lengthRatio < 1.5) {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }

  // Calculate brand consistency score
  private calculateBrandConsistencyScore(content: string, persona: PersonaData): number {
    let score = 0.5; // Base score
    
    // Check for persona theme alignment
    if (persona.key_themes) {
      const contentLower = content.toLowerCase();
      const themeMatches = persona.key_themes.filter(theme => 
        contentLower.includes(theme.toLowerCase())
      ).length;
      
      if (themeMatches > 0) {
        score += (themeMatches / persona.key_themes.length) * 0.3;
      }
    }
    
    // Check tone alignment (simplified)
    const contentLower = content.toLowerCase();
    const toneWords = {
      casual: ['hey', 'guys', 'awesome', 'cool', 'love'],
      professional: ['pleased', 'excited', 'announce', 'share', 'grateful'],
      edgy: ['raw', 'real', 'bold', 'fierce', 'unapologetic'],
      friendly: ['friends', 'family', 'together', 'community', 'support']
    };
    
    const personaTone = persona.tone?.toLowerCase() || 'casual';
    const relevantWords = toneWords[personaTone as keyof typeof toneWords] || [];
    
    const toneMatches = relevantWords.filter(word => 
      contentLower.includes(word)
    ).length;
    
    if (toneMatches > 0) {
      score += Math.min(0.2, toneMatches * 0.05);
    }
    
    return Math.min(1, score);
  }

  // Clear cache (useful for testing)
  clearCache(): void {
    cache.flushAll();
  }

  // Get cache statistics
  getCacheStats(): any {
    return cache.getStats();
  }
}

// Export singleton instance
export const aiContentService = new AIContentService();
export default aiContentService;