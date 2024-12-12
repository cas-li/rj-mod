import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import { HfInference } from "npm:@huggingface/inference";
import { serve } from "https://deno.land/std@0.182.0/http/server.ts";

const connections = new Map<
  WebSocket,
  { role: string; id: string; chatHistory: Array<{ role: string; content: string }> }
>();

const hf = new HfInference(Deno.env.get("HUGGINGFACE_API_KEY")!);

const initialPrompt = {
  role: "assistant",
  content: "I am an expert in restorative justice and transgender advocacy that is assisting a moderator who will use my messages to inform their responses to your messages, so I will speak as if I am the moderator, not as an LLM. I am concise and persuasive and talk like a college student in a personable way. I will help you understand why you caused harm by posting this message. I will also share suggestions on how to be a better community member moving forward. When appropriate, I will provide educational resources tailored to the user’s personality and comments.",
};

async function queryHuggingFaceChat(chatHistory: Array<{ role: string; content: string }>): Promise<string> {
  try {
    console.log("Sending chat history to Hugging Face:", chatHistory);

    const result = await hf.chatCompletion({
      model: "microsoft/Phi-3-mini-4k-instruct",
      messages: [initialPrompt, ...chatHistory],
      max_tokens: 512,
      temperature: 0.3,
    });
    console.log("Hugging Face Response:", result);

    if (result.choices && result.choices.length > 0) {
      return result.choices[0].message.content || "No valid response from Hugging Face.";
    }
    return "No valid response from Hugging Face.";
  } catch (error) {
    console.error("Error querying Hugging Face API:", error);
    return "Error communicating with Hugging Face API.";
  }
}

function broadcastToAll(senderId: string, message: string) {
  console.log("Broadcasting message to all clients:", { senderId, message });
  for (const [socket] of connections) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ senderId, message, type: "user_message" }));
    }
  }
}

function sendSuggestionToModerators(suggestion: string) {
  console.log("Sending suggestion to moderators:", suggestion);
  for (const [socket, { role }] of connections) {
    if (socket.readyState === WebSocket.OPEN && role === "moderator") {
      socket.send(JSON.stringify({ senderId: "assistant", message: suggestion, type: "suggested_response" }));
    }
  }
}

serve((req) => {
  const { pathname } = new URL(req.url);

  if (pathname === "/ws") {
    const { response, socket } = Deno.upgradeWebSocket(req);
    console.log("New WebSocket connection established.");

    const clientId = Math.random().toString(36).substr(2, 9);
    connections.set(socket, { role: "user", id: clientId, chatHistory: [] });

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("Message received:", data);

      if (data.type === "register" && data.userId) {
        console.log("Registering userId:", data.userId);
        const connection = connections.get(socket);
        if (connection) {
          connections.set(socket, { ...connection, id: data.userId });
        }
        return;
      }

      if (data.type === "role" && data.role) {
        console.log(`Updating role to ${data.role}`);
        const connection = connections.get(socket);
        if (connection) {
          connections.set(socket, { ...connection, role: data.role });
        }
        return;
      }

      if (data.message) {
        const connection = connections.get(socket);
        if (!connection) {
          console.warn("Connection not found for socket. Message ignored.");
          return;
        }

        console.log("Processing message:", data.message);
        connection.chatHistory.push({ role: "user", content: data.message });

        broadcastToAll(connection.id, data.message);

        if (connection.role === "user") {
          const assistantReply = await queryHuggingFaceChat(connection.chatHistory);
          connection.chatHistory.push({ role: "assistant", content: assistantReply });
          sendSuggestionToModerators(assistantReply);
        }
      }
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed.");
      connections.delete(socket);
    };
    return response;
  }
  return new Response("Not Found", { status: 404 });
});
