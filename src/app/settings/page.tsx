"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ProfileList } from "@/components/profiles/ProfileList";
import { ModelConfig } from "@/components/models/ModelConfig";
import { CustomModelForm } from "@/components/models/CustomModelForm";
import { ArrowLeft, Plus, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import * as api from "@/lib/api";

/** True when IPC config handlers are available (Electron production only). */
function useIPC(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.scripterAPI?.isElectron &&
    window.location.protocol === "file:"
  );
}

function ApiKeySection() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (useIPC()) {
      window.scripterAPI!.config.getApiKey().then((key) => {
        setApiKey(key);
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (useIPC()) {
      await window.scripterAPI!.config.setApiKey(apiKey);
      setSaved(true);
      toast.success("API key saved");
      setTimeout(() => setSaved(false), 2000);
    }
  }, [apiKey]);

  const handleTest = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error("Enter an API key first");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        toast.success("API key is valid");
      } else {
        toast.error("Invalid API key");
      }
    } catch {
      toast.error("Could not reach OpenRouter");
    } finally {
      setTesting(false);
    }
  }, [apiKey]);

  if (!useIPC()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">OpenRouter API Key</p>
              <p className="text-xs text-muted-foreground">
                Set via OPENROUTER_API_KEY environment variable
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              Server-side only
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">API Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium mb-2">OpenRouter API Key</p>
          <p className="text-xs text-muted-foreground mb-3">
            Your API key is encrypted and stored locally. Get one at{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              openrouter.ai/keys
            </a>
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
                className="pr-9 text-sm font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full w-9"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={testing}
              className="gap-1"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Test"
              )}
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-1">
              {saved ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Saved
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [showCustomModel, setShowCustomModel] = useState(false);

  const handleAddModel = async (data: {
    name: string;
    provider: "openrouter" | "ollama";
    modelId: string;
    baseUrl?: string;
  }) => {
    await api.createModel(data);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>

        <div className="space-y-8">
          {/* API Key */}
          <ApiKeySection />

          <Separator />

          {/* Model Configuration */}
          <ModelConfig />

          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Custom Models</h3>
            <Button
              size="sm"
              className="gap-1"
              onClick={() => setShowCustomModel(true)}
            >
              <Plus className="h-4 w-4" />
              Add Model
            </Button>
          </div>

          <Separator />

          {/* Profiles */}
          <ProfileList />
        </div>

        <CustomModelForm
          open={showCustomModel}
          onOpenChange={setShowCustomModel}
          onSave={handleAddModel}
        />
      </div>
    </div>
  );
}
