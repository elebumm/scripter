"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileEditor } from "./ProfileEditor";
import type { EvaluationProfile } from "@/types";
import { Plus, Pencil, Trash2 } from "lucide-react";
import * as api from "@/lib/api";

export function ProfileList() {
  const [profiles, setProfiles] = useState<EvaluationProfile[]>([]);
  const [editingProfile, setEditingProfile] =
    useState<EvaluationProfile | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const loadProfiles = () => {
    api.listProfiles().then(setProfiles).catch(() => {});
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleSave = async (data: {
    name: string;
    systemPrompt: string;
    criteriaWeights: string;
  }) => {
    if (editingProfile) {
      await api.updateProfile(editingProfile.id, data);
    } else {
      await api.createProfile(data);
    }
    setEditingProfile(null);
    loadProfiles();
  };

  const handleDelete = async (id: number) => {
    await api.deleteProfile(id);
    loadProfiles();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Evaluation Profiles</h3>
        <Button
          size="sm"
          className="gap-1"
          onClick={() => {
            setEditingProfile(null);
            setShowEditor(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New Profile
        </Button>
      </div>

      <div className="grid gap-3">
        {profiles.map((profile) => (
          <Card key={profile.id}>
            <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {profile.name}
                {profile.isDefault && (
                  <Badge variant="secondary" className="text-xs">
                    Default
                  </Badge>
                )}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingProfile(profile);
                    setShowEditor(true);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                {!profile.isDefault && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(profile.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-xs text-muted-foreground line-clamp-2">
                {profile.systemPrompt}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ProfileEditor
        profile={editingProfile}
        open={showEditor}
        onOpenChange={setShowEditor}
        onSave={handleSave}
      />
    </div>
  );
}
