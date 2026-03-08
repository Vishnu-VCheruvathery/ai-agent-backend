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
  answer: z.string().optional(),
  context: z.string().optional()
});


function getLastUserQuestion(messages: any[]){
  const reversed = [...messages].reverse();
  const user = reversed.find((m) => m instanceof HumanMessage);

  if(!user) return "";

  if(typeof user.content === "string") return user.content;

  if(Array.isArray(user.content)){
    return user.content.map((c) => ("text" in c ? c.text : "")).join("");
  }

  return "";
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

async function  retrieveNode(state: z.infer<typeof MessagesState>) {
  const question = getLastUserQuestion(state.messages);

  let context = "";

  if(state.mode === "docs_only"){
    context = await searchDB.invoke({
      query: question,
      convId: state.convId
    })
  }

  if(state.mode === "web_only"){
    context = await googleSearchTool.invoke({
      query: question,
    })
  }

  return {
    ...state,
    context,
  }
}


async function finalAnswer(state: z.infer<typeof MessagesState>) {
   const question = getLastUserQuestion(state.messages);

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
    new HumanMessage(`
      Question:
      ${question}

      Context: 
      ${state.context}
      `)
  ]);

  return {
    ...state,
    messages: [...state.messages, aiMessage], // ✅ important
    answer: typeof aiMessage.content === "string" ? aiMessage.content : JSON.stringify(aiMessage.content),
  };
}




const agent = new StateGraph(MessagesState)
  .addNode("retrieve", retrieveNode)
  .addNode("finalAnswer", finalAnswer)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "finalAnswer")
  .addEdge("finalAnswer", END)
  .compile();

export default agent
