"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { clients } from "@/lib/clients";

type Step = "client" | "direction" | "data" | "results";

const MAX_SCREENSHOTS = 10;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ACCEPT_IMAGES = "image/jpeg,image/png,image/gif,image/webp";

type ScreenshotEntry = { file: File; previewUrl: string };

export default function GoogleAdsAdvisor() {
  const [step, setStep] = useState<Step>("client");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [direction, setDirection] = useState("");
  const [campaignData, setCampaignData] = useState("");
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotsRef = useRef(screenshots);
  screenshotsRef.current = screenshots;

  useLayoutEffect(() => {
    return () => {
      screenshotsRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  function addScreenshotFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    setScreenshots((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_SCREENSHOTS) break;
        if (!file.type.startsWith("image/")) continue;
        if (file.size > MAX_IMAGE_BYTES) continue;
        next.push({ file, previewUrl: URL.createObjectURL(file) });
      }
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeScreenshot(index: number) {
    setScreenshots((prev) => {
      const entry = prev[index];
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (!selectedClientId || !direction.trim()) return;
    setStep("results");
    setOutput("");
    setError("");
    setLoading(true);

    try {
      let res: Response;
      if (screenshots.length > 0) {
        const form = new FormData();
        form.set("clientId", selectedClientId);
        form.set("direction", direction.trim());
        form.set("campaignData", campaignData.trim());
        screenshots.forEach((s) => form.append("screenshots", s.file));
        res = await fetch("/api/recommend", { method: "POST", body: form });
      } else {
        res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: selectedClientId,
            direction: direction.trim(),
            campaignData: campaignData.trim(),
          }),
        });
      }

      if (!res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        const ref = res.headers.get("x-request-id");
        let detail = `HTTP ${res.status}`;
        if (ct.includes("application/json")) {
          try {
            const j = (await res.json()) as {
              error?: string;
              hint?: string;
              requestId?: string;
            };
            detail = [j.error, j.hint, j.requestId ? `(ref: ${j.requestId})` : ref ? `(ref: ${ref})` : ""]
              .filter(Boolean)
              .join("\n\n");
          } catch {
            detail = await res.text().catch(() => detail);
          }
        } else {
          detail = (await res.text().catch(() => "")) || detail;
        }
        throw new Error(detail);
      }

      if (!res.body) {
        throw new Error("Server returned an empty body. Check the terminal for [recommend] logs.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setOutput(accumulated);
        // Auto-scroll
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    } catch (err) {
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError(
          "Network error (browser: Failed to fetch / empty response). Usually the API route crashed or the connection was reset.\n\n" +
            "Where to look: the terminal where you ran `npm run dev` (127.0.0.1:7424). Search for lines starting with `[recommend]` and any stack trace below them."
        );
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("client");
    setSelectedClientId("");
    setDirection("");
    setCampaignData("");
    screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    setScreenshots([]);
    setOutput("");
    setError("");
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex-1 bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Google Ads Advisor</h1>
              <p className="text-xs text-gray-400">HAI Digital Marketing</p>
            </div>
          </div>
          {step !== "client" && (
            <button
              onClick={reset}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Start over
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* STEP 1: Client Selection */}
        {step === "client" && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Select a client</h2>
              <p className="text-gray-400">Choose the client you&apos;re working on.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => {
                    setSelectedClientId(client.id);
                    setStep("direction");
                  }}
                  className="text-left p-6 rounded-xl border border-gray-700 bg-gray-900 hover:border-blue-500 hover:bg-gray-800 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                        {client.name}
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">{client.industry}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-400 transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 mt-3 line-clamp-2">{client.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: Direction */}
        {step === "direction" && (
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("client")}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="text-xs text-blue-400 font-medium uppercase tracking-wide mb-1">{selectedClient?.name}</div>
                <h2 className="text-2xl font-bold text-white">What&apos;s the new direction?</h2>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Business direction or campaign goal
              </label>
              <textarea
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                placeholder={`e.g. "We want to promote that Killa now offers Lunch and Private Events. Lunch should target office workers and the general public. Private events target corporates and people celebrating occasions."`}
                rows={5}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm leading-relaxed"
              />
              <p className="text-xs text-gray-500">Be as specific as possible — target audience, tone, goals, any context the team shared.</p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => direction.trim() && setStep("data")}
                disabled={!direction.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Campaign Data */}
        {step === "data" && (
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("direction")}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="text-xs text-blue-400 font-medium uppercase tracking-wide mb-1">{selectedClient?.name}</div>
                <h2 className="text-2xl font-bold text-white">Paste current campaign data</h2>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-blue-950 border border-blue-800 text-sm text-blue-300">
              <strong className="text-blue-200">Direction set:</strong> {direction}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Campaign data <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <textarea
                value={campaignData}
                onChange={(e) => setCampaignData(e.target.value)}
                placeholder={`Paste anything from Google Ads — campaign names, keywords, ad copy, performance metrics, campaign settings, etc.\n\nExamples:\n- Copy/paste from the Campaigns tab\n- Keywords with match types and bids\n- Current RSA headlines and descriptions\n- Performance data (impressions, clicks, CTR, CPC)\n\nLeave blank if you only attach screenshots, or for fresh setup recommendations.`}
                rows={12}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm font-mono leading-relaxed"
              />
              <p className="text-xs text-gray-500">
                Don&apos;t worry about formatting. Paste raw text, CSV exports, or plain notes from the platform.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-medium text-gray-300">
                  Screenshots <span className="text-gray-500 font-normal">(optional, up to {MAX_SCREENSHOTS})</span>
                </label>
                <span className="text-xs text-gray-500">
                  {screenshots.length}/{MAX_SCREENSHOTS} · JPEG, PNG, GIF, WebP · max {MAX_IMAGE_BYTES / (1024 * 1024)} MB each
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Upload Google Ads UI captures (for example the Assets table: headlines, descriptions, status, metrics). The model reads the images and combines them with your text above.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_IMAGES}
                multiple
                className="hidden"
                onChange={(e) => addScreenshotFiles(e.target.files)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={screenshots.length >= MAX_SCREENSHOTS}
                  className="px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-200 hover:border-blue-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add screenshots
                </button>
                {screenshots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
                      setScreenshots([]);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-red-300 transition-colors"
                  >
                    Remove all
                  </button>
                )}
              </div>
              {screenshots.length > 0 && (
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {screenshots.map((s, i) => (
                    <li
                      key={`${s.previewUrl}-${i}`}
                      className="relative group rounded-lg border border-gray-700 overflow-hidden bg-gray-900 aspect-video"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.previewUrl} alt="" className="w-full h-full object-cover object-top" />
                      <button
                        type="button"
                        onClick={() => removeScreenshot(i)}
                        className="absolute top-1 right-1 w-7 h-7 rounded-md bg-black/70 text-white text-xs font-medium opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label={`Remove screenshot ${i + 1}`}
                      >
                        ×
                      </button>
                      <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-gray-300">
                        {i + 1}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
              >
                Get recommendations
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Results */}
        {step === "results" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-400 font-medium uppercase tracking-wide mb-1">{selectedClient?.name}</div>
                <h2 className="text-2xl font-bold text-white">Recommendations</h2>
              </div>
              {!loading && output && (
                <button
                  onClick={() => navigator.clipboard.writeText(output)}
                  className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy
                </button>
              )}
            </div>

            <div className="p-4 rounded-lg bg-gray-900 border border-gray-800 text-sm">
              <span className="text-gray-400 font-medium">Direction: </span>
              <span className="text-gray-300">{direction}</span>
            </div>

            {error && (
              <div className="p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 min-h-64">
              {loading && !output && (
                <div className="flex items-center gap-3 text-gray-400">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Analyzing campaigns...</span>
                </div>
              )}

              {output && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <MarkdownOutput content={output} />
                  {loading && (
                    <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse" />
                  )}
                </div>
              )}
            </div>

            {!loading && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setStep("direction");
                    setDirection("");
                    setCampaignData("");
                    screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
                    setScreenshots([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    setOutput("");
                  }}
                  className="px-5 py-2 border border-gray-700 text-gray-300 rounded-lg text-sm hover:border-gray-500 hover:text-white transition-colors"
                >
                  New analysis for {selectedClient?.name}
                </button>
              </div>
            )}

            <div ref={outputRef} />
          </div>
        )}
      </main>
    </div>
  );
}

// Simple markdown renderer without external deps
function MarkdownOutput({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-white mt-5 mb-2">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-white mt-6 mb-3 pb-1 border-b border-gray-700">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-xl font-bold text-white mt-6 mb-3">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-2 text-gray-300">
          {items.map((item, j) => (
            <li key={j} className="text-sm leading-relaxed">
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-2 text-gray-300">
          {items.map((item, j) => (
            <li key={j} className="text-sm leading-relaxed">
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ol>
      );
      continue;
    } else if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-gray-800 rounded-lg p-3 my-3 overflow-x-auto text-xs text-green-300 font-mono">
          {codeLines.join("\n")}
        </pre>
      );
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-blue-500 pl-4 py-1 my-2 text-gray-300 text-sm italic">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      elements.push(
        <p key={i} className="text-sm font-semibold text-white my-1">
          {line.slice(2, -2)}
        </p>
      );
    } else {
      elements.push(
        <p key={i} className="text-sm text-gray-300 leading-relaxed my-1">
          <InlineMarkdown text={line} />
        </p>
      );
    }

    i++;
  }

  return <div>{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle **bold** and `code` inline
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="bg-gray-800 text-blue-300 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
