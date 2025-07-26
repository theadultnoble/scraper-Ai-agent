import * as dotenv from "dotenv";
import { TavilySearch } from "@langchain/tavily";
import { ChatOllama } from "@langchain/ollama";
import * as readline from "readline";
import { ChatPromptTemplate } from "@langchain/core/prompts";

dotenv.config();

const tavilyApiKey = process.env.TAVILY_API_KEY;
const agentTools = [
  new TavilySearch({
    maxResults: 3,
    tavilyApiKey: tavilyApiKey,
  }),
];

// Improved prompt for better summary formatting
const prompt = ChatPromptTemplate.fromTemplate(`
  You are a helpful assistant that writes clear, well-structured summaries based on web search results. Your answer should:
  - Start with a concise overview of the main findings.
  - Reference sources in context (e.g., "A Google blog post (July 2025) notes..." or "According to the official GitHub page...").
  - Group related information together.
  - Use bullet points or paragraphs for clarity.
  - End with a list of sources for further reading, if relevant.

Here is the user's question:
{question}

Here are the search results:
{searchResults}

Write a readable summary for the user, following the above instructions.
`);

const llm = new ChatOllama({
  baseUrl: "http://localhost:11434",
  model: "llama3",
  temperature: 0,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const chat = async () => {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      rl.close();
      return;
    }
    const tavilyTool = agentTools[0];
    // TavilySearch returns a Promise, so we await the result
    const result = await tavilyTool.invoke({ query: input });

    // Handle both stringified and direct array results from TavilySearch
    let parsedResults: { url: string; content: string }[];
    if (typeof result === "string") {
      parsedResults = JSON.parse(result);
    } else if (Array.isArray(result)) {
      parsedResults = result;
    } else {
      parsedResults = [];
    }

    // The result from TavilySearch is an array of objects, not a JSON string.
    // Let's format it directly.
    function extractDomain(url: string): string {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return url;
      }
    }

    const formattedSearchResults = parsedResults
      .map(
        (res: { url: string; content: string }) =>
          `- [${extractDomain(res.url)}] ${res.content
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 350)}${
            res.content.length > 350 ? "..." : ""
          }\n  Source: ${res.url}`
      )
      .join("\n\n");

    const formatted = await prompt.formatMessages({
      question: input,
      searchResults: formattedSearchResults,
    });

    const response = await llm.invoke(formatted);

    // Clean up and print the LLM's summary in a readable way
    const summary =
      typeof response.content === "string"
        ? response.content.trim()
        : String(response.content).trim();
    console.log(`\nAgent Summary:\n${summary}\n`);

    chat();
  });
};

(async () => {
  console.log(
    "Agent: Hi! I'm your search AI agent. What do you want to know today?"
  );
  chat();
})();
