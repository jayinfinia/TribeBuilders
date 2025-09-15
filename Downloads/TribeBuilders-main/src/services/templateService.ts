import pool from '../Config/connection';
import { ContentTemplate } from './aiService';

export interface TemplateVariable {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  required: boolean;
  default_value?: any;
  options?: string[]; // For select type
  description?: string;
}

export interface CreateTemplateRequest {
  template_name: string;
  template_type: string;
  template_content: string;
  variables: TemplateVariable[];
  description?: string;
}

export interface ProcessedTemplate {
  template_id: string;
  processed_content: string;
  variables_used: Record<string, any>;
  processing_date: Date;
}

class TemplateService {
  // Predefined templates for common content types
  private static readonly DEFAULT_TEMPLATES: CreateTemplateRequest[] = [
    {
      template_name: 'New Release Announcement',
      template_type: 'release',
      template_content: `🎵 Hey {{audience}}! 

I'm {{emotion}} to announce my new {{release_type}} "{{title}}" is {{availability}}! 

{{description}}

{{call_to_action}}

#NewMusic #{{genre}} #{{artist_name}}`,
      variables: [
        { name: 'audience', type: 'select', required: true, options: ['everyone', 'fans', 'friends', 'family'], default_value: 'everyone' },
        { name: 'emotion', type: 'select', required: true, options: ['excited', 'thrilled', 'pumped', 'stoked'], default_value: 'excited' },
        { name: 'release_type', type: 'select', required: true, options: ['single', 'album', 'EP', 'mixtape'], default_value: 'single' },
        { name: 'title', type: 'text', required: true, description: 'Title of the release' },
        { name: 'availability', type: 'select', required: true, options: ['out now', 'available everywhere', 'coming soon'], default_value: 'out now' },
        { name: 'description', type: 'text', required: false, description: 'Brief description of the release' },
        { name: 'call_to_action', type: 'select', required: true, options: ['Check it out!', 'Link in bio!', 'Stream it now!'], default_value: 'Check it out!' },
        { name: 'genre', type: 'text', required: false, default_value: 'Music' },
        { name: 'artist_name', type: 'text', required: true, description: 'Artist name for hashtag' }
      ]
    },
    {
      template_name: 'Behind the Scenes',
      template_type: 'story',
      template_content: `✨ Behind the scenes: {{story_hook}}

{{main_content}}

{{reflection}}

What's your favorite part of the creative process? 💭

#BehindTheScenes #{{genre}} #CreativeProcess`,
      variables: [
        { name: 'story_hook', type: 'text', required: true, description: 'Opening line to grab attention' },
        { name: 'main_content', type: 'text', required: true, description: 'Main story content' },
        { name: 'reflection', type: 'text', required: false, description: 'Personal reflection or insight' },
        { name: 'genre', type: 'text', required: false, default_value: 'Music' }
      ]
    },
    {
      template_name: 'General Announcement',
      template_type: 'announcement',
      template_content: `📢 {{announcement_type}}: {{main_message}}

{{details}}

{{engagement_question}}

#{{hashtag}}`,
      variables: [
        { name: 'announcement_type', type: 'select', required: true, options: ['Big news', 'Update', 'Important announcement'], default_value: 'Big news' },
        { name: 'main_message', type: 'text', required: true, description: 'Main announcement message' },
        { name: 'details', type: 'text', required: false, description: 'Additional details' },
        { name: 'engagement_question', type: 'text', required: false, description: 'Question to engage audience' },
        { name: 'hashtag', type: 'text', required: true, default_value: 'Music' }
      ]
    },
    {
      template_name: 'Fan Appreciation',
      template_type: 'social_post',
      template_content: `💙 {{gratitude_expression}} to all my {{fan_reference}}! 

{{appreciation_message}}

{{personal_note}}

You all mean the world to me! 🌟

#Grateful #{{artist_name}}Family`,
      variables: [
        { name: 'gratitude_expression', type: 'select', required: true, options: ['Huge thanks', 'So grateful', 'Sending love'], default_value: 'Huge thanks' },
        { name: 'fan_reference', type: 'select', required: true, options: ['fans', 'supporters', 'listeners', 'amazing people'], default_value: 'fans' },
        { name: 'appreciation_message', type: 'text', required: true, description: 'Specific appreciation message' },
        { name: 'personal_note', type: 'text', required: false, description: 'Personal touch or story' },
        { name: 'artist_name', type: 'text', required: true, description: 'Artist name for hashtag' }
      ]
    },
    {
      template_name: 'Tour/Event Announcement',
      template_type: 'announcement',
      template_content: `🎤 {{event_type}} ANNOUNCEMENT! 

I'll be performing {{event_details}} on {{date}} at {{venue}}!

{{ticket_info}}

{{excitement_message}}

Can't wait to see you there! 🎶

#Live #{{city}} #{{artist_name}}Tour`,
      variables: [
        { name: 'event_type', type: 'select', required: true, options: ['TOUR', 'CONCERT', 'SHOW', 'PERFORMANCE'], default_value: 'SHOW' },
        { name: 'event_details', type: 'text', required: true, description: 'Event description' },
        { name: 'date', type: 'date', required: true, description: 'Event date' },
        { name: 'venue', type: 'text', required: true, description: 'Venue name and location' },
        { name: 'ticket_info', type: 'text', required: false, description: 'Ticket information' },
        { name: 'excitement_message', type: 'text', required: false, description: 'Personal excitement message' },
        { name: 'city', type: 'text', required: true, description: 'City for hashtag' },
        { name: 'artist_name', type: 'text', required: true, description: 'Artist name for hashtag' }
      ]
    }
  ];

  // Initialize default templates
  async initializeDefaultTemplates(): Promise<void> {
    try {
      for (const template of TemplateService.DEFAULT_TEMPLATES) {
        await this.createTemplate(template);
      }
      console.log('✅ Default templates initialized');
    } catch (error) {
      console.error('Error initializing default templates:', error);
    }
  }

  // Create a new template
  async createTemplate(templateData: CreateTemplateRequest): Promise<ContentTemplate> {
    const query = `
      INSERT INTO content_templates (
        template_name, 
        template_type, 
        template_content, 
        variables, 
        is_active
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (template_name) DO UPDATE SET
        template_content = EXCLUDED.template_content,
        variables = EXCLUDED.variables,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      templateData.template_name,
      templateData.template_type,
      templateData.template_content,
      JSON.stringify({
        variables: templateData.variables,
        description: templateData.description
      }),
      true
    ]);

    return result.rows[0];
  }

  // Get all templates or filter by type
  async getTemplates(templateType?: string): Promise<ContentTemplate[]> {
    let query = 'SELECT * FROM content_templates WHERE is_active = true';
    const params: any[] = [];

    if (templateType) {
      query += ' AND template_type = $1';
      params.push(templateType);
    }

    query += ' ORDER BY template_name ASC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  // Get template by ID
  async getTemplateById(id: string): Promise<ContentTemplate | null> {
    const query = 'SELECT * FROM content_templates WHERE id = $1 AND is_active = true';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  // Process template with variables
  async processTemplate(
    templateId: string, 
    variables: Record<string, any>,
    personaData?: any
  ): Promise<ProcessedTemplate> {
    const template = await this.getTemplateById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const templateVariables = template.variables?.variables || [];
    let processedContent = template.template_content;

    // Validate required variables
    const missingRequired = templateVariables
      .filter((v: TemplateVariable) => v.required && !variables[v.name])
      .map((v: TemplateVariable) => v.name);

    if (missingRequired.length > 0) {
      throw new Error(`Missing required variables: ${missingRequired.join(', ')}`);
    }

    // Apply default values for missing optional variables
    const processedVariables = { ...variables };
    templateVariables.forEach((templateVar: TemplateVariable) => {
      if (!processedVariables[templateVar.name] && templateVar.default_value !== undefined) {
        processedVariables[templateVar.name] = templateVar.default_value;
      }
    });

    // Replace template variables with actual values
    Object.entries(processedVariables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedContent = processedContent.replace(regex, String(value));
    });

    // Handle any remaining unreplaced variables
    const unreplacedMatches = processedContent.match(/{{([^}]+)}}/g);
    if (unreplacedMatches) {
      console.warn('Unreplaced template variables found:', unreplacedMatches);
      // Replace with empty string or default placeholder
      unreplacedMatches.forEach(match => {
        processedContent = processedContent.replace(match, '');
      });
    }

    // Clean up any double spaces or extra newlines
    processedContent = processedContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    return {
      template_id: templateId,
      processed_content: processedContent,
      variables_used: processedVariables,
      processing_date: new Date()
    };
  }

  // Update template
  async updateTemplate(id: string, updates: Partial<CreateTemplateRequest>): Promise<ContentTemplate | null> {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'variables') {
        setClause.push(`variables = ${paramIndex}`);
        values.push(JSON.stringify({ variables: value }));
      } else {
        setClause.push(`${key} = ${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    });

    if (setClause.length === 0) {
      throw new Error('No valid updates provided');
    }

    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE content_templates 
      SET ${setClause.join(', ')}
      WHERE id = ${paramIndex} AND is_active = true
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  // Soft delete template
  async deleteTemplate(id: string): Promise<boolean> {
    const query = `
      UPDATE content_templates 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // Get template usage statistics
  async getTemplateStats(templateId?: string): Promise<any> {
    let query = `
      SELECT 
        ct.id,
        ct.template_name,
        ct.template_type,
        COUNT(gc.id) as usage_count,
        MAX(gc.created_at) as last_used
      FROM content_templates ct
      LEFT JOIN generated_content gc ON ct.id = gc.template_id
      WHERE ct.is_active = true
    `;

    const params = [];
    if (templateId) {
      query += ' AND ct.id = $1';
      params.push(templateId);
    }

    query += ' GROUP BY ct.id, ct.template_name, ct.template_type ORDER BY usage_count DESC';

    const result = await pool.query(query, params);
    return templateId ? result.rows[0] : result.rows;
  }

  // Smart template suggestion based on persona and content type
  async suggestTemplates(
    contentType: string, 
    personaData?: any,
    context?: string
  ): Promise<ContentTemplate[]> {
    // Get templates matching content type
    const templates = await this.getTemplates(contentType);
    
    if (!personaData) {
      return templates;
    }

    // Score templates based on persona compatibility
    const scoredTemplates = templates.map(template => {
      let score = 1.0; // Base score

      // Check if template variables align with persona data
      const variables = template.variables?.variables || [];
      
      // Bonus for templates that can use persona data
      if (variables.some((v: TemplateVariable) => 
        ['artist_name', 'genre'].includes(v.name))) {
        score += 0.2;
      }

      // Check tone compatibility (simplified)
      const templateContent = template.template_content.toLowerCase();
      const personaTone = personaData.tone?.toLowerCase() || '';
      
      if (personaTone === 'casual' && templateContent.includes('hey')) score += 0.1;
      if (personaTone === 'professional' && templateContent.includes('pleased')) score += 0.1;
      if (personaTone === 'edgy' && templateContent.includes('raw')) score += 0.1;

      return { ...template, compatibility_score: score };
    });

    // Sort by compatibility score
    return scoredTemplates
      .sort((a, b) => b.compatibility_score - a.compatibility_score)
      .slice(0, 5); // Return top 5
  }

  // Validate template structure
  validateTemplate(templateData: CreateTemplateRequest): { isValid: boolean; errors: string[] } {
    const errors = [];

    // Check required fields
    if (!templateData.template_name?.trim()) {
      errors.push('Template name is required');
    }

    if (!templateData.template_type?.trim()) {
      errors.push('Template type is required');
    }

    if (!templateData.template_content?.trim()) {
      errors.push('Template content is required');
    }

    // Check for template variables in content
    const contentVariables = (templateData.template_content.match(/{{([^}]+)}}/g) || [])
      .map(match => match.replace(/[{}]/g, ''));

    const definedVariables = templateData.variables.map(v => v.name);

    // Check for undefined variables in content
    const undefinedVariables = contentVariables.filter(cv => !definedVariables.includes(cv));
    if (undefinedVariables.length > 0) {
      errors.push(`Undefined variables in content: ${undefinedVariables.join(', ')}`);
    }

    // Check for unused variable definitions
    const unusedVariables = definedVariables.filter(dv => !contentVariables.includes(dv));
    if (unusedVariables.length > 0) {
      errors.push(`Unused variable definitions: ${unusedVariables.join(', ')}`);
    }

    // Validate variable definitions
    templateData.variables.forEach((variable, index) => {
      if (!variable.name?.trim()) {
        errors.push(`Variable ${index + 1}: name is required`);
      }

      if (!['text', 'number', 'date', 'boolean', 'select'].includes(variable.type)) {
        errors.push(`Variable ${variable.name}: invalid type`);
      }

      if (variable.type === 'select' && (!variable.options || variable.options.length === 0)) {
        errors.push(`Variable ${variable.name}: select type requires options`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const templateService = new TemplateService();
export default templateService;