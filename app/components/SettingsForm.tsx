"use client";

import React, { useState } from "react";
import { 
  Key, Eye, EyeOff, Save, Trash2, CheckCircle2, XCircle, Loader2, Sparkles, RefreshCw 
} from "lucide-react";
import { saveApiKey, deleteApiKey, toggleApiKey, testApiKeyConnection } from "@/app/actions/settings";

interface ApiKeyStatus {
  provider: string;
  isActive: boolean;
  hasKey: boolean;
}

interface SettingsFormProps {
  initialKeys: ApiKeyStatus[];
  trialStatus: { used: number; limit: number };
}

const PROVIDERS = [
  { id: "openai", name: "OpenAI", placeholder: "sk-...", desc: "GPT-4o music intelligence", url: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-...", desc: "Claude 3.5 Sonnet encyclopedic search", url: "https://console.anthropic.com/" },
  { id: "google", name: "Google Gemini", placeholder: "AIzaSy...", desc: "Gemini 1.5 Pro deep reasoning", url: "https://aistudio.google.com/" },
  { id: "cohere", name: "Cohere", placeholder: "...", desc: "Command R+ multilingual capability", url: "https://dashboard.cohere.com/" },
  { id: "groq", name: "Groq", placeholder: "gsk_...", desc: "Super-fast Llama 3.1 inference", url: "https://console.groq.com/" },
  { id: "mistral", name: "Mistral AI", placeholder: "...", desc: "Mistral Large music suggestions", url: "https://console.mistral.ai/" },
];

export default function SettingsForm({ initialKeys, trialStatus }: SettingsFormProps) {
  const [keys, setKeys] = useState<ApiKeyStatus[]>(initialKeys);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; msg?: string }>>({});
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: "success" | "error" }[]>([]);

  const addToast = (msg: string, type: "success" | "error") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleInputChange = (provider: string, val: string) => {
    setInputs((prev) => ({ ...prev, [provider]: val }));
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleSave = async (provider: string) => {
    const keyVal = inputs[provider];
    if (!keyVal || keyVal.trim() === "") {
      addToast("API key cannot be empty", "error");
      return;
    }

    setLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      const res = await saveApiKey(provider, keyVal, true);
      if (res.success) {
        addToast(`${provider.toUpperCase()} API key saved successfully`, "success");
        setKeys((prev) => {
          const idx = prev.findIndex((k) => k.provider === provider);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = { provider, isActive: true, hasKey: true };
            return updated;
          } else {
            return [...prev, { provider, isActive: true, hasKey: true }];
          }
        });
        setInputs((prev) => ({ ...prev, [provider]: "" }));
      } else {
        addToast(res.error || "Failed to save API key", "error");
      }
    } catch (err: any) {
      addToast(err.message || "An unexpected error occurred", "error");
    } finally {
      setLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleDelete = async (provider: string) => {
    if (!confirm(`Are you sure you want to delete your ${provider.toUpperCase()} API key?`)) return;

    setLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      const res = await deleteApiKey(provider);
      if (res.success) {
        addToast(`${provider.toUpperCase()} API key deleted`, "success");
        setKeys((prev) => prev.filter((k) => k.provider !== provider));
        setTestResult((prev) => {
          const updated = { ...prev };
          delete updated[provider];
          return updated;
        });
      } else {
        addToast(res.error || "Failed to delete API key", "error");
      }
    } catch (err: any) {
      addToast(err.message || "An unexpected error occurred", "error");
    } finally {
      setLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleToggle = async (provider: string, currentActive: boolean) => {
    const nextActive = !currentActive;
    try {
      const res = await toggleApiKey(provider, nextActive);
      if (res.success) {
        setKeys((prev) =>
          prev.map((k) => (k.provider === provider ? { ...k, isActive: nextActive } : k))
        );
        addToast(`${provider.toUpperCase()} API Key ${nextActive ? "enabled" : "disabled"}`, "success");
      } else {
        addToast(res.error || "Failed to toggle status", "error");
      }
    } catch (err: any) {
      addToast(err.message || "An unexpected error occurred", "error");
    }
  };

  const handleTest = async (provider: string) => {
    setTesting((prev) => ({ ...prev, [provider]: true }));
    setTestResult((prev) => {
      const updated = { ...prev };
      delete updated[provider];
      return updated;
    });

    try {
      // If there is an unsaved key value in input, test that instead
      const keyVal = inputs[provider]?.trim() || undefined;
      const res = await testApiKeyConnection(provider, keyVal);
      if (res.success) {
        setTestResult((prev) => ({ ...prev, [provider]: { success: true, msg: res.response } }));
        addToast(`${provider.toUpperCase()} connection test successful!`, "success");
      } else {
        setTestResult((prev) => ({ ...prev, [provider]: { success: false, msg: res.error } }));
        addToast(`${provider.toUpperCase()} test failed: ${res.error}`, "error");
      }
    } catch (err: any) {
      setTestResult((prev) => ({ ...prev, [provider]: { success: false, msg: err.message } }));
      addToast(`Test failed: ${err.message}`, "error");
    } finally {
      setTesting((prev) => ({ ...prev, [provider]: false }));
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 border text-sm font-medium transition-all duration-300 transform translate-y-0 ${
              t.type === "success" 
                ? "bg-green-950/80 border-green-500/30 text-green-400" 
                : "bg-red-950/80 border-red-500/30 text-red-400"
            }`}
          >
            {t.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      {/* Free Trial Banner */}
      <div className="glass rounded-2xl p-6 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 border-violet-500/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl -z-10" />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-violet-200">Default Mistral Free Trial</h2>
          </div>
          <p className="text-zinc-400 text-sm max-w-xl">
            We provide 10 complimentary AI queries powered by Mistral AI on our server key. 
            Once you exhaust these, simply input your own API keys below to unlock unlimited music discovery queries.
          </p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-5 py-4 min-w-[200px] flex flex-col items-center justify-center">
          <span className="text-xs text-zinc-500 uppercase font-semibold tracking-wider">Free Queries Used</span>
          <span className="text-3xl font-bold mt-1 text-violet-400">
            {trialStatus.used} <span className="text-zinc-600 text-xl">/ {trialStatus.limit}</span>
          </span>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-violet-500 to-pink-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, (trialStatus.used / trialStatus.limit) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-zinc-200 flex items-center gap-2">
          <Key className="h-5 w-5 text-violet-400" />
          Configure Your Keys
        </h2>
        <p className="text-sm text-zinc-400">
          Your API keys are stored locally on the server using AES-256-GCM encryption. They are never transmitted back to the browser or client-side context.
        </p>
      </div>

      {/* Provider List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PROVIDERS.map((provider) => {
          const status = keys.find((k) => k.provider === provider.id);
          const hasKey = status?.hasKey || false;
          const isActive = status?.isActive || false;
          const isTesting = testing[provider.id] || false;
          const testRes = testResult[provider.id];
          const isSaving = loading[provider.id] || false;

          return (
            <div 
              key={provider.id}
              className={`glass rounded-2xl p-6 border transition-all duration-300 ${
                isActive 
                  ? "border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.05)]" 
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-zinc-200">{provider.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{provider.desc}</p>
                </div>
                
                {hasKey && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 uppercase font-mono tracking-wider">
                      {isActive ? "Active" : "Disabled"}
                    </span>
                    <button
                      onClick={() => handleToggle(provider.id, isActive)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isActive ? "bg-violet-500" : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isActive ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <div className="relative">
                  <input
                    type={showKeys[provider.id] ? "text" : "password"}
                    placeholder={hasKey ? "••••••••••••••••••••••••••••••••" : provider.placeholder}
                    value={inputs[provider.id] || ""}
                    onChange={(e) => handleInputChange(provider.id, e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl py-2.5 pl-3 pr-10 text-sm font-mono text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-violet-500/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey(provider.id)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-400 transition-colors"
                  >
                    {showKeys[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => handleSave(provider.id)}
                    disabled={isSaving || !inputs[provider.id]}
                    className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-950/50 disabled:text-zinc-600 text-white rounded-xl py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save Key
                  </button>

                  {hasKey && (
                    <button
                      onClick={() => handleDelete(provider.id)}
                      disabled={isSaving}
                      className="bg-red-950/40 hover:bg-red-950/80 border border-red-900/50 text-red-400 rounded-xl py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}

                  <button
                    onClick={() => handleTest(provider.id)}
                    disabled={isTesting || (!hasKey && !inputs[provider.id])}
                    className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-zinc-300 rounded-xl py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Test API
                  </button>
                </div>

                {/* API Provider link */}
                <div className="text-right">
                  <a
                    href={provider.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-violet-400 hover:underline hover:text-violet-300 transition-colors"
                  >
                    Get Key from {provider.name} ↗
                  </a>
                </div>

                {/* Testing connection logs */}
                {testRes && (
                  <div 
                    className={`p-3 rounded-xl border text-xs font-mono transition-colors ${
                      testRes.success 
                        ? "bg-green-950/30 border-green-500/20 text-green-400" 
                        : "bg-red-950/30 border-red-500/20 text-red-400"
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1.5 mb-0.5">
                      {testRes.success ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Test Success
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5" />
                          Test Failed
                        </>
                      )}
                    </div>
                    <span className="break-words opacity-90">
                      {testRes.success ? `Model responded: "${testRes.msg}"` : testRes.msg}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
