/**
 * Learn / Chat Mode Toggle Component
 *
 * Displayed at the top of DeafInterface.
 * Shows the current mode with full visual context, and lets the user switch.
 */

import React from 'react';
import { BookOpen, MessageSquare } from 'lucide-react';

interface LearnModeToggleProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}

const LearnModeToggle: React.FC<LearnModeToggleProps> = ({ enabled, onChange }) => {
    return (
        <div className="flex items-center gap-3 bg-slate-800/70 rounded-2xl border border-slate-700/50 p-2 shadow-lg backdrop-blur-sm select-none">

            {/* Chat Mode pill */}
            <button
                onClick={() => onChange(false)}
                aria-pressed={!enabled}
                title="Chat Mode — AI conversation, text only"
                className={`
          flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200
          ${!enabled
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                    }
        `}
            >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span>Chat</span>
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-slate-600/60 flex-shrink-0" />

            {/* Learn Mode pill */}
            <button
                onClick={() => onChange(true)}
                aria-pressed={enabled}
                title="Learn Mode — instant text-to-sign translation"
                className={`
          flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200
          ${enabled
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                    }
        `}
            >
                <BookOpen className="w-4 h-4 flex-shrink-0" />
                <span>Learn ASL</span>
            </button>

            {/* Mode description — right of toggle */}
            <div className="flex-1 ml-1 min-w-0 hidden sm:block">
                <p className={`text-xs truncate transition-colors duration-200 ${enabled ? 'text-emerald-400' : 'text-indigo-400'}`}>
                    {enabled
                        ? '📖 Type text → see signs instantly (no AI)'
                        : '💬 Ask the AI anything (no signs)'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                    Press <kbd className="font-mono bg-slate-700/80 px-1 rounded text-slate-400">Ctrl+L</kbd> to switch
                </p>
            </div>
        </div>
    );
};

export default LearnModeToggle;
