import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '../../../config/configuration';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * Multi-provider LLM client — dispatches to Anthropic Claude, OpenAI GPT,
 * or Google Gemini based on the AI_PROVIDER config.
 *
 * Only used when AI_USE_REAL_LLM is true (a real, non-placeholder key in prod).
 * Returns the model's text content. Throws on any failure so the caller can
 * fall back to the deterministic mock generator.
 */
@Injectable()
export class LlmClientService {
  private readonly logger = new Logger('LlmClient');
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  // Gemini client is created per-call (lightweight)

  constructor(private readonly config: ConfigService) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const provider = this.config.get<AiProvider>('AI_PROVIDER');
    this.logger.log(`Calling ${provider} — user prompt ${userPrompt.length} chars`);

    switch (provider) {
      case 'openai':
        return this.callOpenAI(systemPrompt, userPrompt);
      case 'gemini':
        return this.callGemini(systemPrompt, userPrompt);
      case 'groq':
        return this.callGroq(systemPrompt, userPrompt);
      case 'anthropic':
      default:
        return this.callAnthropic(systemPrompt, userPrompt);
    }
  }

  // ---------------------------------------------------------------------------
  // Anthropic Claude
  // ---------------------------------------------------------------------------
  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      this.anthropicClient = new Anthropic({
        apiKey: this.config.get<string>('ANTHROPIC_API_KEY')!,
      });
    }
    return this.anthropicClient;
  }

  private async callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = 'claude-3-5-sonnet-20241022';
    this.logger.log(`  → model: ${model}`);
    const response = await this.getAnthropicClient().messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('\n');
    return text;
  }

  // ---------------------------------------------------------------------------
  // OpenAI GPT
  // ---------------------------------------------------------------------------
  private getOpenAIClient(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({
        apiKey: this.config.get<string>('OPENAI_API_KEY')!,
      });
    }
    return this.openaiClient;
  }

  private async callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o';
    this.logger.log(`  → model: ${model}`);
    const client = this.getOpenAIClient();
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  // ---------------------------------------------------------------------------
  // Google Gemini
  // ---------------------------------------------------------------------------
  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    // Dynamic import to avoid loading the SDK when not needed
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
    this.logger.log(`  → model: ${model}`);

    const genAI = new GoogleGenerativeAI(this.config.get<string>('GEMINI_API_KEY')!);
    const geminiModel = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: 4096,
      },
    });

    const result = await geminiModel.generateContent(userPrompt);
    const response = result.response;
    return response.text();
  }

  // ---------------------------------------------------------------------------
  // Groq (OpenAI-compatible)
  // ---------------------------------------------------------------------------
  private async callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = this.config.get<string>('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
    this.logger.log(`  → model: ${model}`);
    
    const client = new OpenAI({
      apiKey: this.config.get<string>('GROQ_API_KEY')!,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
