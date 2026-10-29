"use client";

import { type ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  Code, Terminal, Desktop, Robot, Cpu, Database, Globe,
  WifiHigh, CloudArrowUp, Shield, Lock, Key, Bug,
  Brain, Atom, Dna, Flask, Microscope, TestTube, GraduationCap,
  BookOpen, MagnifyingGlass, Lightbulb, ChartLine,
  Tree, Leaf, Mountains, Sun, Moon, Drop, Wind,
  Fire, Snowflake, Planet, Waves,
  User, Users, Heart, HandHeart, Handshake, Baby,
  Person, UsersThree,
  Camera, FilmSlate, Microphone, MusicNote, Palette,
  PaintBrush, Pen, Notebook, Newspaper, VideoCamera,
  Monitor, Television,
  CookingPot, Coffee, Wine, ForkKnife,
  Airplane, Car, Compass, MapPin, House, Buildings,
  Bridge, Tent,
  CurrencyDollar, Briefcase, Megaphone, Presentation,
  Strategy, Target, Trophy, Medal,
  Heartbeat, FirstAid, Barbell, Bicycle,
  Lightning, Sparkle, Star, Rocket, Anchor,
  Skull, Ghost, Alien, Eye, GameController,
  Sword, Crown, Diamond, Scales, Hourglass,
  PuzzlePiece, ChatCircle,
  FileText,
} from "@phosphor-icons/react";

const ICON_MAP: Record<string, ComponentType<IconProps>> = {
  Code, Terminal, Desktop, Robot, Cpu, Database, Globe,
  WifiHigh, CloudArrowUp, Shield, Lock, Key, Bug,
  Brain, Atom, Dna, Flask, Microscope, TestTube, GraduationCap,
  BookOpen, MagnifyingGlass, Lightbulb, ChartLine,
  Tree, Leaf, Mountains, Sun, Moon, Drop, Wind,
  Fire, Snowflake, Planet, Waves,
  User, Users, Heart, HandHeart, Handshake, Baby,
  Person, UsersThree,
  Camera, FilmSlate, Microphone, MusicNote, Palette,
  PaintBrush, Pen, Notebook, Newspaper, VideoCamera,
  Monitor, Television,
  CookingPot, Coffee, Wine, ForkKnife,
  Airplane, Car, Compass, MapPin, House, Buildings,
  Bridge, Tent,
  CurrencyDollar, Briefcase, Megaphone, Presentation,
  Strategy, Target, Trophy, Medal,
  Heartbeat, FirstAid, Barbell, Bicycle,
  Lightning, Sparkle, Star, Rocket, Anchor,
  Skull, Ghost, Alien, Eye, GameController,
  Sword, Crown, Diamond, Scales, Hourglass,
  Puzzle: PuzzlePiece, ChatCircle,
  FileText,
};

// Deterministic color from icon name
const CARD_COLORS = [
  { bg: "bg-stone-100", text: "text-stone-400" },
  { bg: "bg-amber-50", text: "text-amber-300" },
  { bg: "bg-emerald-50", text: "text-emerald-300" },
  { bg: "bg-sky-50", text: "text-sky-300" },
  { bg: "bg-violet-50", text: "text-violet-300" },
  { bg: "bg-rose-50", text: "text-rose-300" },
  { bg: "bg-teal-50", text: "text-teal-300" },
  { bg: "bg-orange-50", text: "text-orange-300" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface ScriptIconProps {
  icon: string | null;
  title: string;
  size?: number;
}

export function ScriptIcon({ icon, title, size = 48 }: ScriptIconProps) {
  const IconComponent = icon ? (ICON_MAP[icon] ?? ICON_MAP.FileText) : ICON_MAP.FileText;
  const colorIdx = hashString(icon ?? title) % CARD_COLORS.length;
  const color = CARD_COLORS[colorIdx];

  return (
    <div className={`w-full h-full rounded-2xl ${color.bg} flex items-center justify-center`}>
      <IconComponent size={size} weight="duotone" className={color.text} />
    </div>
  );
}
