import { GoogleGenAI } from '@google/genai';
import type { AIChatMessage } from '../types';
import { hasApiBackend, tryApiRequest } from './apiClient';

interface AdvisorChatRequest {
  message: string;
  systemContext: string;
  history: AIChatMessage[];
  customerId?: string;
  applicationId?: string;
}

interface AdvisorChatResponse {
  text: string;
}

let browserGemini: GoogleGenAI | null = null;

function getBrowserApiKey(): string {
  return (import.meta as any).env.VITE_GEMINI_API_KEY || '';
}

export function isAdvisorConfigured(): boolean {
  return hasApiBackend() || getBrowserApiKey().length > 0;
}

function getBrowserGemini(): GoogleGenAI {
  if (!browserGemini) {
    const apiKey = getBrowserApiKey();
    if (!apiKey) {
      throw new Error('AI advisor is not configured. Set VITE_API_BASE_URL for backend AI or VITE_GEMINI_API_KEY for local prototype fallback.');
    }
    browserGemini = new GoogleGenAI({ apiKey });
  }
  return browserGemini;
}

export async function sendAdvisorMessage(request: AdvisorChatRequest): Promise<string> {
  const backendResponse = await tryApiRequest<AdvisorChatResponse>('/api/ai/advisor/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  });

  if (backendResponse?.text) return backendResponse.text;

  const genai = getBrowserGemini();
  const chat = genai.chats.create({
    model: 'gemini-2.0-flash',
    config: { systemInstruction: request.systemContext },
    history: request.history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  });

  const response = await chat.sendMessage({ message: request.message });
  return response.text ?? 'I apologise, I could not generate a response. Please try again.';
}
