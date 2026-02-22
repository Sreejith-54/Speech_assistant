import React from 'react';
import { Volume2, Ear } from 'lucide-react';

type AccessibilityMode = 'visually-challenged' | 'deaf';

interface ModeSelectorProps {
  currentMode: AccessibilityMode;
  onModeChange: (mode: AccessibilityMode) => void;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ currentMode, onModeChange }) => {
  return (
    <div className="absolute top-4 right-4 z-50 flex gap-2 bg-slate-900/80 backdrop-blur-sm rounded-lg p-2 border border-slate-700/50">
      {/* Visually Challenged Mode */}
      <button
        onClick={() => onModeChange('visually-challenged')}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200
          ${currentMode === 'visually-challenged'
            ? 'bg-blue-600/80 text-white shadow-lg shadow-blue-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }
        `}
        title="Visually Challenged Mode - Audio focused"
      >
        <Volume2 className="w-4 h-4" />
        <span className="text-sm font-medium">Audio</span>
      </button>

      {/* Deaf Mode */}
      <button
        onClick={() => onModeChange('deaf')}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200
          ${currentMode === 'deaf'
            ? 'bg-purple-600/80 text-white shadow-lg shadow-purple-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }
        `}
        title="Deaf Mode - Visual & Text with Sign Language"
      >
        <Ear className="w-4 h-4" />
        <span className="text-sm font-medium">Deaf</span>
      </button>
    </div>
  );
};

export default ModeSelector;
