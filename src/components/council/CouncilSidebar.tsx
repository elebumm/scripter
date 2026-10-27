"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { getCouncilPersona } from "@/lib/design-system";
import type { CouncilMember } from "@/types/council";

interface CouncilSidebarProps {
  members: CouncilMember[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onViewAll: () => void;
}

export function CouncilSidebar({ members, activeId, onSelect, onViewAll }: CouncilSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="fixed top-1/2 right-6 -translate-y-1/2 z-30 flex flex-col items-center gap-1 rounded-full py-3 px-2 glass">
      {/* View All */}
      <button
        onClick={onViewAll}
        className="relative w-10 h-10 rounded-full flex items-center justify-center bg-white border border-slate-200 hover:border-slate-400 transition-all group"
        onMouseEnter={() => setHoveredId("view-all")}
        onMouseLeave={() => setHoveredId(null)}
      >
        <Layers className="h-4 w-4 text-slate-500" />
        {hoveredId === "view-all" && (
          <span className="absolute right-full mr-3 whitespace-nowrap text-xs font-medium text-slate-600 bg-white/80 backdrop-blur-sm rounded px-2 py-1 shadow-sm">
            View All
          </span>
        )}
      </button>

      {/* Divider */}
      <div className="w-6 h-px bg-slate-200 my-1" />

      {/* Council members */}
      {members.map((member) => {
        const persona = getCouncilPersona(member.id, member.name);
        const isActive = member.id === activeId;
        const isHovered = member.id === hoveredId;

        return (
          <button
            key={member.id}
            onClick={() => onSelect(member.id)}
            onMouseEnter={() => setHoveredId(member.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all"
            style={{
              background: isActive || isHovered ? persona.color : "white",
              border: isActive
                ? `2px solid ${persona.color}`
                : "1px solid #e2e8f0",
              boxShadow: isActive
                ? `0 0 12px ${persona.color}40`
                : "none",
            }}
          >
            <span
              className="text-[11px] font-bold transition-colors"
              style={{
                color: isActive || isHovered ? "white" : persona.color,
              }}
            >
              {persona.initials}
            </span>
            {isHovered && (
              <span
                className="absolute right-full mr-3 whitespace-nowrap text-xs font-medium bg-white/80 backdrop-blur-sm rounded px-2 py-1 shadow-sm"
                style={{ color: persona.color }}
              >
                {persona.name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
