import React, { useState } from 'react';
import {
  Search,
  Edit,
  MoreHorizontal,
  Video,
  Plus,
  Mic,
  Sparkles,
  Smile,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { spatialSound } from '../../utils/spatialSound';

import { Glyph } from '../shell/Glyph';
interface ChatMessage {
  id: string;
  sender: string;
  isMe: boolean;
  text?: string;
  image?: string;
  genmoji?: string;
  edited?: boolean;
}

export const MessagesGenmojiApp: React.FC<{
  onOpenKeyboard: (initial: string, onUpdate: (v: string) => void) => void;
}> = ({ onOpenKeyboard }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'Rody Albuerne',
      isMe: false,
      text: "I went with a classic. Grandpa's homemade ravioli.",
      image: 'ravioli-photo',
    },
    {
      id: '2',
      sender: 'Me',
      isMe: true,
      text: 'One of my favorites! How did it turn out?',
    },
    {
      id: '3',
      sender: 'Rody Albuerne',
      isMe: false,
      text: "Don't tell Grandpa, but I got creative with the recipe. I might even like it more than the original.",
    },
    {
      id: '4',
      sender: 'Me',
      isMe: true,
      text: "What's your secret?",
      edited: true,
    },
    {
      id: '5',
      sender: 'Rody Albuerne',
      isMe: false,
      text: "Add garlic to the butter, and then stir the sage in after removing it from the heat, while it's still hot. Top with pine nuts!",
    },
    {
      id: '6',
      sender: 'Me',
      isMe: true,
      text: "Incredible, I'll have to try making it myself.",
    },
    {
      id: '7',
      sender: 'Magico Martin',
      isMe: false,
      text: "Oh we should make this for Lani's birthday coming up",
    },
  ]);

  const [draft, setDraft] = useState('');
  const [genmojiOpen, setGenmojiOpen] = useState(false);
  const [genmojiPrompt, setGenmojiPrompt] = useState('Garlic ravioli');
  const [genmojiState, setGenmojiState] = useState<'idle' | 'morphing' | 'ready'>('ready');
  const [selectedVariant, setSelectedVariant] = useState(0);

  const genmojiVariants = [
    {
      title: 'Classic Garlic & Sage Ravioli Plate',
      plateBg: 'radial-gradient(circle at 35% 35%, #fef08a, #ca8a04)',
      items: ['🥟', '🥟', '🥟', '🥟'],
      garnish: '🌿🧄',
    },
    {
      title: 'Golden Butter Ravioli Bowl',
      plateBg: 'radial-gradient(circle at 35% 35%, #fde68a, #d97706)',
      items: ['🥟', '🥟', '🥟'],
      garnish: '🧄✨',
    },
    {
      title: 'Artisanal Pine-Nut Ravioli Trio',
      plateBg: 'radial-gradient(circle at 35% 35%, #fef9c3, #b45309)',
      items: ['🥟', '🥟', '🥟', '🥟'],
      garnish: '🌱🌰',
    },
  ];

  const triggerGenerateGenmoji = (promptText: string) => {
    setGenmojiPrompt(promptText);
    setGenmojiState('morphing');
    spatialSound.playSiriChime();
    setTimeout(() => {
      setGenmojiState('ready');
    }, 1100);
  };

  const handleAddGenmojiToChat = () => {
    spatialSound.playPinchTap();
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        sender: 'Me',
        isMe: true,
        genmoji: genmojiPrompt || 'Garlic ravioli',
        text: `Made a custom "${genmojiPrompt}" Genmoji for Lani's dinner!`,
      },
    ]);
    setGenmojiOpen(false);
  };

  const contacts = [
    {
      name: 'Dawn Ramirez',
      time: '10:20 AM',
      preview: "Sounds good tonight! I have some extra snacks I'll bring over.",
      unread: false,
    },
    {
      name: 'Po-Chun Yeh',
      time: '10:02 AM',
      preview: "On my way! Don't start without me.",
      unread: true,
    },
    {
      name: 'Harland Ankrum',
      time: '9:45 AM',
      preview: 'Ooh, that sounds great. See you soon!',
      unread: false,
    },
    {
      name: 'Antonin Monier',
      time: '9:34 AM',
      preview: 'How is it going?',
      unread: false,
    },
    {
      name: 'Elena Lance',
      time: '9:12 AM',
      preview: 'No worries! Catch you next time.',
      unread: false,
    },
    {
      name: 'Magico Martin',
      time: 'Yesterday',
      preview: "Here's another reference if she...",
      unread: false,
    },
  ];

  return (
    <div className="w-full h-full grid grid-cols-12 text-white relative preserve-3d">
      {/* LEFT SIDEBAR: Pinned Contacts & Thread List (Exact match to large_2x.mp4 00:00) */}
      <div className="col-span-4 border-r border-white/10 bg-black/20 p-4 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[20px] font-bold tracking-tight">Messages</h2>
          <div className="flex items-center gap-1.5">
            <button className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            <button className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25">
              <Edit className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="h-8 rounded-full bg-black/30 border border-white/10 px-3 flex items-center gap-2 text-xs text-white/60">
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <Mic className="w-3.5 h-3.5 ml-auto" />
        </div>

        {/* 5 Pinned Circular Contacts (Ashley, Olivia & Will, Foodie Group, Guillermo, Animation) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[
            { name: 'Ashley', badge: '👩🏽', active: false },
            { name: 'Olivia & Will', badge: '👫', active: false },
            { name: 'Foodie Group', badge: '🍝', active: true },
            { name: 'Guillermo', badge: '🧔🏻‍♂️', active: false },
            { name: 'Animation', badge: 'AT', active: false },
          ].map((pin) => (
            <div
              key={pin.name}
              className={`p-1.5 rounded-2xl flex flex-col items-center gap-1 cursor-pointer transition ${
                pin.active ? 'bg-amber-400/25 border border-amber-300/40' : 'hover:bg-white/10'
              }`}
            >
              <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-base font-bold shadow">
                <Glyph e={pin.badge} />
              </div>
              <span className="text-[10px] text-white/85 truncate max-w-full font-medium">
                {pin.name}
              </span>
            </div>
          ))}
        </div>

        {/* Direct Message Threads */}
        <div className="space-y-1 pt-1">
          {contacts.map((c) => (
            <div
              key={c.name}
              className="px-2.5 py-2 rounded-2xl hover:bg-white/10 flex items-center gap-2.5 cursor-pointer transition"
            >
              {c.unread && (
                <span className="w-2 h-2 rounded-full bg-[#0A84FF] shrink-0" />
              )}
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-stone-500 to-stone-700 flex items-center justify-center text-xs font-bold shrink-0">
                {c.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-[12.5px] font-semibold truncate">
                    {c.name}
                  </span>
                  <span className="text-[10px] text-white/50 ml-1 shrink-0">
                    {c.time}
                  </span>
                </div>
                <div className="text-[11px] text-white/65 truncate">{c.preview}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT CHAT PANE: Foodie Group + Genmoji Button */}
      <div className="col-span-8 flex flex-col justify-between h-full overflow-hidden">
        {/* Top Thread Header */}
        <div className="h-14 border-b border-white/10 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500/30 border border-amber-300/50 flex items-center justify-center text-sm">
              <Glyph e="🍝" />
            </div>
            <div>
              <div className="text-[13px] font-semibold">Foodie Group</div>
              <div className="text-[10px] text-white/60">4 People • Active Spatial Thread</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                spatialSound.playSiriChime();
                setGenmojiOpen(true);
              }}
              className="vision-btn px-3 py-1.5 rounded-full ai-rainbow-glow text-white text-[11.5px] font-semibold flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>New Genmoji</span>
            </button>
            <button className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.isMe ? 'items-end' : 'items-start'}`}
            >
              {!m.isMe && (
                <span className="text-[10.5px] text-white/55 ml-3 mb-0.5">
                  {m.sender}
                </span>
              )}

              {/* Ravioli Photo Attachment */}
              {m.image === 'ravioli-photo' && (
                <div className="mb-1.5 w-52 h-36 rounded-2xl overflow-hidden border border-white/20 bg-stone-800 relative flex items-center justify-center shadow-lg">
                  <div className="w-28 h-28 rounded-full bg-stone-100 border-4 border-stone-300 flex items-center justify-center shadow-inner">
                    <div className="grid grid-cols-2 gap-1 text-2xl">
                      <span><Glyph e="🥟" /></span>
                      <span><Glyph e="🥟" /></span>
                      <span><Glyph e="🥟" /></span>
                      <span><Glyph e="🌿" /></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom 3D Genmoji Sticker */}
              {m.genmoji && (
                <div className="mb-1 w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 p-1 shadow-[0_12px_30px_rgba(245,158,11,0.5)] flex items-center justify-center border-2 border-white/60 animate-bounce">
                  <div className="text-3xl"><Glyph e="🥟🧄🌿" /></div>
                </div>
              )}

              {m.text && (
                <div
                  className={`max-w-[72%] px-4 py-2.5 rounded-[20px] text-[13px] leading-snug shadow ${
                    m.isMe
                      ? 'bg-[#0A84FF] text-white rounded-br-md'
                      : 'bg-white/15 text-white/95 rounded-bl-md border border-white/10'
                  }`}
                >
                  {m.text}
                </div>
              )}

              {m.edited && (
                <span className="text-[10px] text-[#0A84FF] mt-0.5 mr-1 font-medium">
                  Edited
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Bottom Message Input Bar */}
        <div className="p-4 border-t border-white/10 flex items-center gap-2.5">
          <button
            onClick={() => {
              spatialSound.playPinchTap();
              setGenmojiOpen(true);
            }}
            className="vision-btn w-9 h-9 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white"
            title="Create New Genmoji (Apple Intelligence)"
          >
            <Plus className="w-4 h-4" />
          </button>

          <div className="flex-1 h-10 rounded-full bg-black/30 border border-white/15 px-4 flex items-center gap-2">
            <Mic className="w-4 h-4 text-white/60" />
            <input
              type="text"
              value={draft}
              onFocus={() => onOpenKeyboard(draft, setDraft)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  setMessages((prev) => [
                    ...prev,
                    { id: String(Date.now()), sender: 'Me', isMe: true, text: draft },
                  ]);
                  setDraft('');
                }
              }}
              placeholder="iMessage"
              className="bg-transparent flex-1 text-[13px] text-white placeholder-white/45 focus:outline-none"
            />
            <button
              onClick={() => setGenmojiOpen(true)}
              className="text-white/70 hover:text-white"
              title="Open Genmoji Creator"
            >
              <Smile className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* FLOATING NEW GENMOJI MODAL (Exact replica of large_2x.mp4 00:05-00:19) */}
      {genmojiOpen && (
        <div className="absolute inset-0 z-50 bg-black/45 backdrop-blur-md flex items-center justify-center p-4">
          <div
            style={{ transform: 'translateZ(75px)' }}
            className="w-[370px] h-[395px] rounded-[34px] vision-glass p-5 flex flex-col justify-between shadow-[0_35px_90px_rgba(0,0,0,0.8)] border border-white/25"
          >
            {/* Modal Header: Cancel | New Genmoji beta | Add */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setGenmojiOpen(false)}
                className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-[12px] font-medium"
              >
                Cancel
              </button>

              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-bold">New Genmoji</span>
                <span className="px-1.5 py-0.5 rounded bg-white/20 text-[9px] font-bold uppercase tracking-wider text-white/85">
                  beta
                </span>
              </div>

              <button
                onClick={handleAddGenmojiToChat}
                className="px-3.5 py-1 rounded-full bg-white text-black font-semibold text-[12px] hover:scale-105 transition"
              >
                Add
              </button>
            </div>

            {/* Center Swirling Iridescent Orb OR 3D Garlic Ravioli Genmoji Carousel */}
            <div className="my-auto flex flex-col items-center justify-center relative">
              {genmojiState === 'morphing' ? (
                <div className="w-36 h-36 rounded-full ai-morph-sphere flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-white animate-spin" />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      setSelectedVariant(
                        (selectedVariant - 1 + genmojiVariants.length) %
                          genmojiVariants.length
                      )
                    }
                    className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* 3D Glossy Ravioli Plate Genmoji (00:11-00:19 of large_2x.mp4) */}
                  <div
                    style={{ background: genmojiVariants[selectedVariant].plateBg }}
                    className="w-36 h-36 rounded-full border-4 border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_4px_12px_rgba(255,255,255,0.8)] flex flex-col items-center justify-center relative transition-all duration-300"
                  >
                    <div className="grid grid-cols-2 gap-1 text-3xl drop-shadow">
                      {genmojiVariants[selectedVariant].items.map((it, i) => (
                        <span key={i}><Glyph e={it} /></span>
                      ))}
                    </div>
                    <span className="text-sm mt-0.5">
                      <Glyph e={genmojiVariants[selectedVariant].garnish} />
                    </span>
                  </div>

                  <button
                    onClick={() =>
                      setSelectedVariant((selectedVariant + 1) % genmojiVariants.length)
                    }
                    className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Pagination Dots (• • •) */}
              <div className="flex items-center gap-1.5 mt-4">
                {genmojiVariants.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedVariant(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      selectedVariant === idx ? 'bg-white w-3' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>

              <div className="text-[10px] text-white/55 mt-2">
                Some descriptions may create unexpected results
              </div>
            </div>

            {/* Bottom Apple Intelligence Rainbow Glowing Input Bar ("Garlic ravioli") */}
            <div className="h-10 rounded-full ai-rainbow-glow px-3.5 flex items-center gap-2">
              <Smile className="w-4 h-4 text-white shrink-0" />
              <input
                type="text"
                value={genmojiPrompt}
                onChange={(e) => setGenmojiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') triggerGenerateGenmoji(genmojiPrompt);
                }}
                placeholder="Describe a Genmoji"
                className="bg-transparent flex-1 text-[13px] font-medium text-white placeholder-white/75 focus:outline-none"
              />
              <button
                onClick={() => triggerGenerateGenmoji(genmojiPrompt)}
                className="px-2.5 py-0.5 rounded-full bg-white/25 hover:bg-white/40 text-[11px] font-semibold text-white"
              >
                Mix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
