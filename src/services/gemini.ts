import { GoogleGenAI, Type } from "@google/genai";
import { Quiz, QuestionType, Difficulty, Question, TimerType } from "../types";

const apiKey = process.env.GEMINI_API_KEY;

/**
 * Attempts to repair common JSON issues like missing closing braces/brackets
 * or unescaped characters.
 */
function repairJson(json: string): any {
  let cleaned = json.trim();
  
  // Remove markdown code blocks if present
  cleaned = cleaned.replace(/```json\n?|```/g, "").trim();

  // Basic repair for truncated JSON: balance braces and brackets
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  // If we are inside a string, close it
  if (inString) {
    cleaned += '"';
  }

  // Close any open braces/brackets in reverse order
  while (stack.length > 0) {
    cleaned += stack.pop();
  }

  return JSON.parse(cleaned);
}

export async function generateQuiz(
  topic: string,
  difficulty: Difficulty,
  questionTypes: QuestionType[],
  count: number = 5,
  retryCount: number = 0
): Promise<Quiz> {
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const schema = {
    type: Type.OBJECT,
    properties: {
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            type: { 
              type: Type.STRING, 
              enum: [QuestionType.MCQ, QuestionType.TRUE_FALSE, QuestionType.ENUMERATION, QuestionType.SHORT_ANSWER] 
            },
            text: { type: Type.STRING },
            choices: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Only for MCQ and TRUE_FALSE. For TRUE_FALSE, it should be ['True', 'False']."
            },
            correctAnswer: { 
              type: Type.STRING,
              description: "For MCQ/TF, the exact string. For SHORT_ANSWER, provide multiple acceptable answers separated by '|' (e.g., 'sea|ocean|water'). For ENUMERATION, a single string containing comma-separated values."
            },
            expectedCount: {
              type: Type.NUMBER,
              description: "Only for ENUMERATION. The number of items expected in the list."
            }
          },
          required: ["id", "type", "text", "correctAnswer"]
        }
      }
    },
    required: ["questions"]
  };

  const prompt = `Generate a ${difficulty} difficulty quiz about "${topic}". 
  The quiz should have ${count} questions.
  Include the following question types: ${questionTypes.join(", ")}.
  
  Rules:
  - For MCQ: Provide 4 distinct choices.
  - For TRUE_FALSE: Choices must be exactly ["True", "False"].
  - For ENUMERATION: The question should ask for a specific list of items (e.g., "List the 3 main parts of a cell"). The correctAnswer should be the expected items separated by commas. Set expectedCount to the number of items.
  - For SHORT_ANSWER: A question that requires a brief text response.
  - Use Markdown for formatting if needed. For math formulas, use LaTeX syntax with $ for inline (e.g. $E=mc^2$) and $$ for block (e.g. $$\\frac{a}{b}$$).
  
  Return the response in valid JSON format matching the provided schema.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema as any,
        temperature: 0.7, // Add some stability
      },
    });

    let result: any;
    const rawText = response.text || "{}";
    
    try {
      result = repairJson(rawText);
    } catch (e) {
      console.error("JSON repair failed:", e);
      if (retryCount < 2) {
        console.log(`Retrying generation (attempt ${retryCount + 1})...`);
        return generateQuiz(topic, difficulty, questionTypes, count, retryCount + 1);
      }
      throw new Error("Failed to generate a valid quiz structure after multiple attempts. Please try a different topic or simplify your request.");
    }

    if (!result || !Array.isArray(result.questions)) {
      throw new Error("The AI returned an invalid quiz format.");
    }
    
    // Transform the response to match our internal Question structure
    const questions: Question[] = result.questions.map((q: any) => {
      // Basic validation for each question
      const type = q.type as QuestionType;
      const text = q.text || "Untitled Question";
      const id = q.id || crypto.randomUUID();
      
      let correctAnswer = q.correctAnswer || "";
      if (type === QuestionType.ENUMERATION && typeof correctAnswer === 'string') {
        correctAnswer = correctAnswer.split(',').map((s: string) => s.trim()).filter(Boolean);
      } else if (type === QuestionType.SHORT_ANSWER && typeof correctAnswer === 'string') {
        correctAnswer = correctAnswer.split('|').map((s: string) => s.trim()).filter(Boolean);
      }

      return {
        id,
        type,
        text,
        choices: q.choices || (type === QuestionType.MCQ ? ["Option A", "Option B", "Option C", "Option D"] : []),
        correctAnswer,
        expectedCount: q.expectedCount || (Array.isArray(correctAnswer) ? correctAnswer.length : 1),
        timerSeconds: 30,
        points: type === QuestionType.SHORT_ANSWER ? 2 : (type === QuestionType.ENUMERATION ? (q.expectedCount || 1) : 1),
      };
    });

    return {
      id: crypto.randomUUID(),
      topic,
      difficulty,
      questions,
      createdAt: Date.now(),
      timerType: TimerType.NONE,
      globalTimerSeconds: 300,
      customScoringEnabled: false
    };
  } catch (err: any) {
    if (retryCount < 2 && !err.message.includes("API key")) {
      return generateQuiz(topic, difficulty, questionTypes, count, retryCount + 1);
    }
    throw err;
  }
}
