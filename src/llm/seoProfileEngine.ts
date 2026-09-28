import { config } from "../config.js";
import { fetchSecondBrainMemories } from "../storage/supabase.js";
import { searchGoogleApi } from "../collectors/googleSearchEngine.js";

export interface ReadRecommendation {
  id: string;
  title: string;
  url: string;
  category: string;
  estimatedMinutes: number;
  snippet: string;
  keyTakeaway: string;
  tags: string[];
}

export interface PostTopicIdea {
  id: string;
  topic: string;
  category: string;
  targetPlatform: string;
  viralHook: string;
  keyPoints: string[];
  trendingHashtags: string[];
  seoKeywords: string[];
  suggestedPostText: string;
}

export interface SkillLearningStep {
  stepNumber: number;
  priorityLabel: "LEARN FIRST (IMMEDIATE)" | "LEARN SECOND (NEXT)" | "LEARN THIRD (ADVANCED)" | "LEARN FOURTH (MASTERY)";
  skillName: string;
  category: string;
  whyLearnNow: string;
  whatToReadAndMaster: string[];
  handsOnProjectToBuild: string;
  whatToPost: {
    title: string;
    targetPlatform: string;
    viralHook: string;
    keyPoints: string[];
    suggestedPostText: string;
    hashtags: string[];
  };
  marketDemandReason: string;
}

export interface PersonalSeoAnalysis {
  candidateName: string;
  seoScore: number; // 0-100
  seoRatingText: string;
  profileHeadlineSuggestions: string[];
  topCoveredKeywords: string[];
  recommendedSeoKeywords: string[];
  profileStrengths: string[];
  seoOptimizationTips: string[];
  skillLearningRoadmap: SkillLearningStep[];
  whatToReadToday: ReadRecommendation[];
  whatToPostToday: PostTopicIdea[];
}

export async function generatePersonalSeoAnalysis(): Promise<PersonalSeoAnalysis> {
  const memories = await fetchSecondBrainMemories();
  const name = config.candidateName || "Abhishek Tiwari";
  
  // Extract candidate profile skills from memory & config
  const memoryTextCombined = memories.map((m) => m.memoryText).join(" ");
  const skillsList = config.profileSkills.length > 0
    ? config.profileSkills
    : ["node.js", "typescript", "express.js", "firebase", "php", "laravel", "postgresql", "websockets", "ai/llm api integration", "async workflows"];

  // Perform Google Search API queries for fresh grounding
  let googleGroundingResults = null;
  try {
    googleGroundingResults = await searchGoogleApi("Node.js AI LLM backend trends 2026", 4);
  } catch {
    // fallback
  }

  // Calculate personal SEO visibility score
  const hasResume = memories.some((m) => m.category?.includes("resume") || m.conceptKey?.includes("pdf_"));
  const hasLinkedIn = memories.some((m) => m.category?.includes("linkedin") || m.conceptKey?.includes("position"));
  const hasVoiceProfile = memories.some((m) => m.category?.includes("voice"));
  const hasNotes = memories.some((m) => m.category?.includes("research") || m.category?.includes("note"));

  let score = 65;
  if (hasResume) score += 10;
  if (hasLinkedIn) score += 10;
  if (hasVoiceProfile) score += 8;
  if (hasNotes) score += 7;
  score = Math.min(98, score);

  const headlineSuggestions = [
    `${name} | Senior Backend Developer (Node.js, Express.js, TypeScript) | AI LLM API Integrations & Async Workflows`,
    `Full-Stack & Backend Engineer | Node.js, Laravel & Firebase Specialist | Building Real-Time WebSocket & AI Systems`,
    `Backend Architect | 3+ Yrs Exp | Node.js, Cloud Functions, PostgreSQL & Gemini Multimodal Vector Search`,
  ];

  const coveredKeywords = [
    "Node.js Backend Development",
    "TypeScript & REST APIs",
    "Firebase Cloud Functions & Firestore",
    "AI / LLM API Integration (OpenAI / Gemini)",
    "Async Job Queues & Background Workers",
    "PHP / Laravel & Eloquent ORM",
    "WebSockets Real-Time Platforms",
    "JWT Authentication & Webhooks",
  ];

  const recommendedKeywords = [
    "Generative AI SDKs & Multimodal RAG",
    "Google ADK (Agent Development Kit)",
    "Vector Database Search (Supabase pgvector)",
    "High-Concurrency Microservices",
    "Redis Caching & Queue Rate Limiting",
    "Docker & Hostinger VPS Cloudflare Deployment",
  ];

  const profileStrengths = [
    "Proven 3+ years hands-on production backend architecture (Node.js, Express, Firebase, PHP/Laravel).",
    "Real-time WebSocket platform experience combined with async task queuing & background processing.",
    "Integrated AI/LLM API workflows with structured JSON outputs and multimodal embeddings.",
  ];

  const seoTips = [
    "Update your LinkedIn & GitHub headlines with high-intent keywords: 'Node.js Backend Engineer', 'TypeScript', 'AI API Integrations'.",
    "Post technical case studies (e.g. 'How I built async retry workers in Node.js') every 2 days to capture organic developer traffic.",
    "Tag posts with high-converting trending hashtags (#NodeJS, #GenerativeAI, #BackendEngineering, #TypeScript).",
    "Link back to your GitHub repositories or live project demos in every Dev.to and LinkedIn article for backlink SEO indexation.",
  ];

  // Daily Curated "What to Read Today" Recommendations (grounded in user's profile)
  const readRecommendations: ReadRecommendation[] = [
    {
      id: "read_node_async",
      title: "Optimizing High-Throughput Node.js Workers & Async Queue Retries",
      url: "https://nodejs.org/en/docs/guides/dont-block-the-event-loop/",
      category: "Backend Architecture",
      estimatedMinutes: 4,
      snippet: "Master non-blocking event loop execution, background worker threads, and memory management for Node.js production APIs.",
      keyTakeaway: "Never execute heavy synchronous computations on the main Event Loop thread; offload to worker queues.",
      tags: ["Node.js", "Async", "EventLoop", "Performance"],
    },
    {
      id: "read_gemini_vector",
      title: "Multimodal Vector Search & RAG Embeddings with Gemini 3.6 Flash",
      url: "https://ai.google.dev/docs",
      category: "Generative AI",
      estimatedMinutes: 5,
      snippet: "How to vectorize technical resumes, PDF documents, and past posts into Supabase pgvector using gemini-embedding-2.",
      keyTakeaway: "Combine exact keyword filters with 768-dimensional multimodal vector embeddings for 99% precise semantic retrieval.",
      tags: ["AI", "Gemini", "Embeddings", "VectorDB"],
    },
    {
      id: "read_laravel_websockets",
      title: "Building Real-Time Collaborative WebSockets in PHP/Laravel & Node.js",
      url: "https://laravel.com/docs/broadcasting",
      category: "Real-Time Systems",
      estimatedMinutes: 3,
      snippet: "Architecting bi-directional event broadcasting using Socket.io, Redis Pub/Sub, and Laravel Echo for zero-latency collaboration.",
      keyTakeaway: "Use Redis Pub/Sub as the central message bus between horizontal Node.js & Laravel server instances.",
      tags: ["WebSockets", "Laravel", "NodeJS", "Redis"],
    },
    {
      id: "read_firebase_functions",
      title: "Production Patterns for Firebase Cloud Functions & Firestore Batching",
      url: "https://firebase.google.com/docs/functions",
      category: "Cloud Serverless",
      estimatedMinutes: 4,
      snippet: "Best practices for writing atomic batch writes, background webhook receivers, and cold-start optimizations in Firebase Admin SDK.",
      keyTakeaway: "Always wrap bulk Firestore operations in batch commits or transactions to maintain ACID data integrity.",
      tags: ["Firebase", "Serverless", "CloudFunctions", "NoSQL"],
    },
  ];

  // Add Google Search grounded result into read recommendations if available
  if (googleGroundingResults && googleGroundingResults.items.length > 0) {
    googleGroundingResults.items.slice(0, 2).forEach((item, idx) => {
      readRecommendations.push({
        id: `read_google_${idx}`,
        title: item.title,
        url: item.link,
        category: "Google Search Live Trend",
        estimatedMinutes: 3,
        snippet: item.snippet,
        keyTakeaway: "Stay grounded in live developer search trends and real-world API updates.",
        tags: ["GoogleSearch", "Trending", "WebSearch"],
      });
    });
  }

  // Daily Curated "What to Post Today" Ideas & Trending Hashtags
  const postIdeas: PostTopicIdea[] = [
    {
      id: "post_node_ai",
      topic: "How I Integrated Gemini 3.6 Flash & Multimodal Embeddings in a Node.js Backend",
      category: "AI Engineering & Node.js",
      targetPlatform: "LinkedIn & Dev.to",
      viralHook: "🤖 Building an AI Second Brain isn't about using fancy wrappers—it's about clean backend architecture.",
      keyPoints: [
        "Chunking PDF resumes and research notes into structured memory records.",
        "Generating 768-d vector embeddings using Gemini API.",
        "Storing and querying vectors in Supabase pgvector with cosine similarity.",
        "Graceful fallback handling when LLM rate limits occur.",
      ],
      trendingHashtags: ["#NodeJS", "#GenerativeAI", "#TypeScript", "#BackendEngineering", "#AIArchitecture", "#WebDevelopment"],
      seoKeywords: ["Node.js AI integration", "Gemini API", "Multimodal Vector Search", "Supabase pgvector"],
      suggestedPostText: `🤖 Building an AI Second Brain isn't about using fancy wrappers—it's about clean backend architecture.

In my recent project, I built a personal Knowledge Engine in Node.js that automatically ingests LinkedIn exports, PDF resumes, and research notes.

Key Architecture Highlights:
1. 📄 Paragraph Chunking: Split documents while preserving contextual headings.
2. 🧠 Multimodal Embeddings: Generate 768-d vector embeddings with Gemini 3.6.
3. ⚡ Supabase Vector Search: Fast semantic similarity queries across all past work experience.
4. 🔄 Async Job Queue: Background processing to keep API response times < 200ms.

How are you integrating vector search into your Node.js apps? Let's discuss in the comments! 👇

#NodeJS #GenerativeAI #TypeScript #BackendEngineering #AIArchitecture #WebDevelopment`,
    },
    {
      id: "post_async_workers",
      topic: "3 Hard-Learned Lessons from 3+ Years of Node.js & Firebase Async Background Jobs",
      category: "Backend Lessons",
      targetPlatform: "LinkedIn & X (Twitter)",
      viralHook: "⚡ The biggest trap in Node.js backend development? Blocking the main Event Loop with un-queued tasks.",
      keyPoints: [
        "Never run long-running loops synchronously inside HTTP route handlers.",
        "Idempotent webhook handling with Redis / Firestore deduplication keys.",
        "Exponential backoff retry strategy for third-party API calls.",
      ],
      trendingHashtags: ["#NodeJS", "#Backend", "#SoftwareEngineering", "#Firebase", "#WebDev", "#SystemDesign"],
      seoKeywords: ["Node.js event loop", "Firebase Cloud Functions", "Async queue workers", "Idempotency"],
      suggestedPostText: `⚡ The biggest trap in Node.js backend development? Blocking the main Event Loop with un-queued tasks.

After 3+ years of building production server-side workflows, here are 3 essential rules I follow:

1️⃣ Route Handlers respond IMMEDIATELY: Offload email dispatching, PDF parsing, and LLM calls to background workers.
2️⃣ Idempotent Webhooks: Always check deduplication keys before processing payment or external webhooks.
3️⃣ Exponential Backoff: Wrap external HTTP requests in retry logic to handle temporary network blips cleanly.

What's your #1 rule for node backend reliability?

#NodeJS #Backend #SoftwareEngineering #Firebase #WebDev #SystemDesign`,
    },
    {
      id: "post_laravel_node_hybrid",
      topic: "Why Combining Node.js WebSockets with Laravel REST APIs is a Power Move",
      category: "Full-Stack Architecture",
      targetPlatform: "Dev.to & LinkedIn",
      viralHook: "🚀 PHP/Laravel for business logic + Node.js for real-time WebSockets = The ultimate backend hybrid.",
      keyPoints: [
        "Laravel handles authentication, ORM database migrations, and complex validation.",
        "Node.js Socket.io handles persistent concurrent WebSocket connections.",
        "Redis Pub/Sub connects both services seamlessly.",
      ],
      trendingHashtags: ["#Laravel", "#NodeJS", "#WebSockets", "#PHP", "#FullStack", "#SoftwareArchitecture"],
      seoKeywords: ["Laravel Node.js hybrid", "Socket.io Redis PubSub", "Real-time backend"],
      suggestedPostText: `🚀 PHP/Laravel for business logic + Node.js for real-time WebSockets = The ultimate backend hybrid.

When building real-time collaborative applications, leveraging each framework's strengths gives you the best performance:

🔹 Laravel: Clean Eloquent ORM, robust JWT/Sanctum auth, and rapid API development.
🔹 Node.js: Event-driven event loop handles thousands of concurrent WebSocket connections effortlessly.
🔹 Redis: Acts as the lightning-fast pub/sub broker between both engines.

Result: 0-latency real-time sync with enterprise-grade API structure!

#Laravel #NodeJS #WebSockets #PHP #FullStack #SoftwareArchitecture`,
    },
  ];

  const skillLearningRoadmap: SkillLearningStep[] = [
    {
      stepNumber: 1,
      priorityLabel: "LEARN FIRST (IMMEDIATE)",
      skillName: "Multimodal Vector Search & Gemini 3.6 Embeddings",
      category: "Generative AI & Semantic Search",
      whyLearnNow: "You already have strong Node.js, Express & Supabase skills. Adding 768-d vector embeddings lets you build AI Knowledge Engines and semantic search immediately.",
      whatToReadAndMaster: [
        "Google Gemini 3.6 Embeddings API & Multimodal text/image vectors",
        "Supabase pgvector cosine distance queries (1 - (a <=> b))",
        "Contextual document chunking for PDF resumes and markdown notes",
      ],
      handsOnProjectToBuild: "Build a Node.js API endpoint that parses uploaded PDF resumes, splits them into semantic paragraphs, generates Gemini embeddings, and saves them to pgvector.",
      whatToPost: {
        title: "How I Built a 768-d Multimodal Vector Engine in Node.js",
        targetPlatform: "LinkedIn & Dev.to",
        viralHook: "🤖 Stop feeding raw 10,000-word prompts to LLMs—use 768-d vector embeddings instead.",
        keyPoints: [
          "Paragraph chunking preserving contextual headers.",
          "Cosine similarity scoring in Supabase pgvector.",
          "Sub-200ms semantic search response times.",
        ],
        suggestedPostText: `🤖 Stop feeding raw 10,000-word prompts to LLMs—use 768-d vector embeddings instead.\n\nIn my recent Node.js backend, I built a personal Knowledge Engine that converts PDF resumes and research notes into 768-d vector embeddings using Gemini 3.6.\n\nKey Architecture:\n1. 📄 PDF Parsing & Paragraph Chunking\n2. 🧠 Gemini 3.6 Multimodal Embedding Generation\n3. ⚡ Supabase pgvector Cosine Search\n4. 🚀 Background Queue Worker for Zero API Latency\n\nHow are you structuring vector search in your apps?\n\n#NodeJS #GenerativeAI #TypeScript #Supabase #AIArchitecture`,
        hashtags: ["#NodeJS", "#GenerativeAI", "#TypeScript", "#Supabase", "#AIArchitecture"],
      },
      marketDemandReason: "Highest growing skill requirement for Remote US/Europe AI Backend Engineer contract roles ($45–$75/hr).",
    },
    {
      stepNumber: 2,
      priorityLabel: "LEARN SECOND (NEXT)",
      skillName: "Autonomous Multi-Agent Frameworks (Google ADK & Zod Tools)",
      category: "Agentic AI Orchestration",
      whyLearnNow: "Single LLM calls are limited. Building multi-agent workflows (Collector -> Scorer -> Publisher) allows you to automate entire enterprise processes.",
      whatToReadAndMaster: [
        "Google Agent Development Kit (ADK) TypeScript SDK (@google/adk)",
        "FunctionTool parameter definitions with Zod schema validation",
        "Multi-agent state persistence and SessionService multi-turn dialogs",
      ],
      handsOnProjectToBuild: "Create a 3-agent pipeline in Node.js using @google/adk where Agent 1 checks topic duplicates, Agent 2 scores match, and Agent 3 drafts social posts.",
      whatToPost: {
        title: "Building Autonomous Multi-Agent Pipelines in Node.js with Google ADK",
        targetPlatform: "LinkedIn & X (Twitter)",
        viralHook: "⚡ Single-prompt LLM wrappers are dead. Multi-agent pipelines are the future of software engineering.",
        keyPoints: [
          "Strict Zod tool argument validation.",
          "Sequential multi-agent handoffs.",
          "Graceful fallback handling when LLM APIs hit limits.",
        ],
        suggestedPostText: `⚡ Single-prompt LLM wrappers are dead. Multi-agent pipelines are the future of software engineering.\n\nI just built a 3-agent pipeline using Google ADK in Node.js:\n1️⃣ Duplicate Checker Agent (queries past 30-day database history)\n2️⃣ Candidate Match Agent (scores skills with Zod schemas)\n3️⃣ Content Publisher Agent (drafts multi-platform posts)\n\nAre you building single-prompt apps or full agentic pipelines?\n\n#GoogleADK #NodeJS #AI #SoftwareEngineering #AgenticAI`,
        hashtags: ["#GoogleADK", "#NodeJS", "#AI", "#SoftwareEngineering", "#AgenticAI"],
      },
      marketDemandReason: "Unlocks Senior AI Developer & Lead Technical Consultant opportunities.",
    },
    {
      stepNumber: 3,
      priorityLabel: "LEARN THIRD (ADVANCED)",
      skillName: "High-Concurrency Redis Pub/Sub & BullMQ Queue Workers",
      category: "Event-Driven Backend Architecture",
      whyLearnNow: "AI processing and real-time WebSockets can easily block the Event Loop. You need Redis queues for rate-limiting, job retries, and pub/sub broadcasting.",
      whatToReadAndMaster: [
        "BullMQ queue job orchestration & concurrency controls",
        "Redis Pub/Sub message distribution between Node.js & Laravel",
        "Exponential backoff retries and Dead-Letter Queue (DLQ) monitoring",
      ],
      handsOnProjectToBuild: "Build a distributed job queue system in Node.js using BullMQ and Redis that processes 5,000 background webhooks/min without blocking the HTTP server.",
      whatToPost: {
        title: "3 Essential Rules for Node.js Background Queue Workers",
        targetPlatform: "Dev.to & LinkedIn",
        viralHook: "🚀 The biggest mistake in Node.js? Executing heavy async loops directly in HTTP route handlers.",
        keyPoints: [
          "HTTP route handlers must return status 202 immediately.",
          "Wrap third-party API calls in exponential retry backoffs.",
          "Isolate Redis queues per service domain.",
        ],
        suggestedPostText: `🚀 The biggest mistake in Node.js? Executing heavy async loops directly in HTTP route handlers.\n\nTo handle thousands of webhooks reliably, I use BullMQ + Redis queue workers:\n1. ⚡ HTTP Route responds in < 15ms\n2. 🔄 BullMQ queues job with automatic 3x retries\n3. 📊 Redis isolates worker pool load\n\nWhat queue library do you use in production?\n\n#NodeJS #Redis #SystemDesign #Backend #SoftwareArchitecture`,
        hashtags: ["#NodeJS", "#Redis", "#SystemDesign", "#Backend", "#SoftwareArchitecture"],
      },
      marketDemandReason: "Critical for high-traffic SaaS products & backend team lead promotions.",
    },
    {
      stepNumber: 4,
      priorityLabel: "LEARN FOURTH (MASTERY)",
      skillName: "Production DevOps: Docker Compose & Hostinger VPS Cloudflare Deployment",
      category: "Cloud Infrastructure & Deployment",
      whyLearnNow: "Owning end-to-end containerized deployment (Docker + Nginx + Cloudflare SSL) makes you a self-sufficient Senior Full-Stack Engineer.",
      whatToReadAndMaster: [
        "Docker multi-stage builds for TypeScript/Node.js apps",
        "Docker Compose orchestration (Node.js + Redis + PostgreSQL)",
        "Cloudflare CDN proxy & Nginx reverse proxy SSL configuration",
      ],
      handsOnProjectToBuild: "Containerize your entire AI Second Brain application with Docker Compose and deploy it live to Hostinger VPS with Cloudflare SSL.",
      whatToPost: {
        title: "From Localhost to Live VPS: Containerizing Node.js + Vector DB",
        targetPlatform: "LinkedIn & Dev.to",
        viralHook: "📦 'It works on my machine' is no longer acceptable. Here is my zero-downtime Docker VPS guide.",
        keyPoints: [
          "Multi-stage Docker build reducing image size by 70%.",
          "Automated secret injection via environment variables.",
          "Cloudflare Zero Trust SSL proxy setup.",
        ],
        suggestedPostText: `📦 'It works on my machine' is no longer acceptable. Here is my zero-downtime Docker VPS deployment guide.\n\nI containerized my Node.js AI backend using multi-stage Docker builds and deployed it to Hostinger VPS behind Cloudflare CDN:\n• 70% smaller container size\n• Zero-downtime container updates\n• Free automated Cloudflare SSL proxying\n\nHow do you deploy your Node.js apps?\n\n#DevOps #Docker #Cloudflare #NodeJS #WebDev`,
        hashtags: ["#DevOps", "#Docker", "#Cloudflare", "#NodeJS", "#WebDev"],
      },
      marketDemandReason: "Essential for Startup Technical Lead, Fractional CTO, & High-Ticket Freelance Engagements.",
    },
  ];

  return {
    candidateName: name,
    seoScore: score,
    seoRatingText: score > 85 ? "🔥 Excellent Developer Personal SEO Visibility" : "✨ Strong Profile – Ready for Keyword Optimization",
    profileHeadlineSuggestions: headlineSuggestions,
    topCoveredKeywords: coveredKeywords,
    recommendedSeoKeywords: recommendedKeywords,
    profileStrengths,
    seoOptimizationTips: seoTips,
    skillLearningRoadmap,
    whatToReadToday: readRecommendations,
    whatToPostToday: postIdeas,
  };
}

