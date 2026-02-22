// ai.mjs
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import * as z from "zod";
import {Tool, tool} from "@langchain/core/tools"
import { messageCollection, ocrCollection } from "../models/chromaCollection.js";
import { AIMessage, ContentBlock, HumanMessage, isAIMessage, isHumanMessage, isToolMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { extractText } from "../index.js";


const MessagesState = z.object({
  convId: z.string(),
 messages: z.array(
  z.union([
    z.instanceof(HumanMessage),
    z.instanceof(AIMessage),
    z.instanceof(ToolMessage),
    z.instanceof(SystemMessage),
  ])
),
  llmCalls: z.number().optional(),
  mode: z.string(),
  answer: z.string().optional()
});

function isPageQuestion(query: string) {
  const q = query.toLowerCase();

  return (
    q.includes("which page") ||
    q.includes("what page") ||
    q.includes("where is") ||
    q.includes("mentioned") ||
    q.includes("locate")
  );
}

export const searchDB = tool(
  async ({ query, convId }) => {
    const result = await ocrCollection.query({
      nResults: 5,
      queryTexts: [query],
      where: { conversation_id: convId },
      include: ["documents", "metadatas"],
    });

    const docs = result.documents?.[0] ?? [];
    const metas = result.metadatas?.[0] ?? [];

    if (!docs.length) return "NO_RELEVANT_CONTEXT";

    // ✅ Strict source blocks
    const formatted = docs.map((text, i) => {
      const page = metas[i]?.page_number ?? null;

      return `
[[SOURCE]]
PAGE=${page}
CONTENT=${text}
[[END]]
`;
    });

    console.log('the formatted: ', formatted)

    return formatted.join("\n");
  },
  {
    name: "search_db",
    schema: z.object({
      query: z.string(),
      convId: z.string(),
    }),
  }
);


const googleSearchTool = tool(
  async ({ query }) => {
    // Call your real web search API here
    return `Search results for: ${query}`;
  },
  {
    name: "google_search",
    description: "Search the web when the user explicitly requests online info.",
    schema: z.object({
      query: z.string(),
    }),
  }
);

const toolsByName = {
  search_db: searchDB,
  google_search: googleSearchTool,
};

 const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-pro",
    temperature: 0,
    maxRetries: 2,
    // other params...
})

export const summarizeModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  temperature: 0
})

function getModelWithTools(mode: string) {
  if (mode === "docs_only") {
    return model.bindTools([searchDB]);
  }

  if (mode === "web_only") {
    return model.bindTools([googleSearchTool]);
  }

  return model.bindTools([searchDB]);
}

async function toolRouter(state: z.infer<typeof MessagesState>) {
  const modelWithTools = getModelWithTools(state.mode);

  const ai = await modelWithTools.invoke([
    new SystemMessage(`
You are a tool router.
You MUST call the correct tool.
Do not answer with text.
`),
    ...state.messages,
  ]);

  return {
    ...state,
    messages: [...state.messages, ai],
  };
}

async function toolNode(state: z.infer<typeof MessagesState>) {
  const last = state.messages[state.messages.length - 1];
  if (!isAIMessage(last)) return state;

  const outputs: ToolMessage[] = [];

  for (const call of last.tool_calls ?? []) {
    const tool = toolsByName[call.name as keyof typeof toolsByName];

    if (!tool) throw new Error("Unknown tool: " + call.name);

    let args = call.args;

    if (call.name === "search_db") {
      args = { ...args, convId: state.convId };
    }

    //@ts-ignore
    const obs = await tool.invoke(args);

    outputs.push(
      new ToolMessage({
        content: String(obs),
        tool_call_id: call.id!,
      })
    );
  }

  return {
    ...state,
    messages: [...state.messages, ...outputs],
  };
}

async function finalAnswer(state: z.infer<typeof MessagesState>) {
  function toText(content: any): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((c) => ("text" in c ? c.text : ""))
        .join("");
    }
    return "";
  }

  const reversed = [...state.messages].reverse();

  const userMsg = reversed.find(isHumanMessage);
  const question = userMsg ? toText(userMsg.content) : "";

  // ✅ PAGE LOOKUP MODE (no Gemini)
  if (state.mode === 'docs_only' && isPageQuestion(question)) {
    const toolMsg = reversed.find(isToolMessage);

    if (!toolMsg) {
      const aiMsg = new AIMessage("NOT_FOUND");
      return {
        ...state,
        messages: [...state.messages, aiMsg],
        answer: "NOT_FOUND",
      };
    }

    const toolText = toText(toolMsg.content);

    if (toolText === "NO_RELEVANT_CONTEXT") {
      const aiMsg = new AIMessage("NOT_FOUND");
      return {
        ...state,
        messages: [...state.messages, aiMsg],
        answer: "NOT_FOUND",
      };
    }

    const matches = toolText.match(/PAGE=(\d+)/g) || [];

    const pages = matches.map((p) =>
      Number(p.replace("PAGE=", "")) + 1
    );

    const uniquePages = Array.from(new Set(pages));

    const finalText = uniquePages.length
      ? `Mentioned on page(s): ${uniquePages.join(", ")}`
      : "NOT_FOUND";

    // ✅ Push AIMessage so socket sees correct output
    const aiMsg = new AIMessage(finalText);

    return {
      ...state,
      messages: [...state.messages, aiMsg],
      answer: finalText,
    };
  }

  const systemPrompt =
    state.mode === "web_only"
      ? `
You are a web assistant.

Rules:
- Answer ONLY using the web search tool output.
- If the tool output does not contain the answer, respond NOT_FOUND.
- Do NOT mention PDF pages.
`
      : `
You are a PDF assistant.

Rules:
- Answer ONLY using the provided PDF source blocks.
- Cite like (Page X).
- Never invent page numbers.
- If missing, respond NOT_FOUND.
`;

  const aiMessage = await model.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages,
  ]);

  return {
    ...state,
    messages: [...state.messages, aiMessage], // ✅ important
    answer: toText(aiMessage.content),
  };
}




const agent = new StateGraph(MessagesState)
  .addNode("toolRouter", toolRouter)
  .addNode("toolNode", toolNode)
  .addNode("finalAnswer", finalAnswer)

  .addEdge(START, "toolRouter")

  .addConditionalEdges("toolRouter", (state) => {
    const last = state.messages[state.messages.length - 1];
    //@ts-ignore
    return last.tool_calls?.length ? "toolNode" : "finalAnswer";
  })

  .addEdge("toolNode", "finalAnswer")

  .addEdge("finalAnswer", END)
  .compile();

export default agent
