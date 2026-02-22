import React, { useState, useEffect } from 'react';
import { User, Sparkles, Eye } from 'lucide-react';
import websocketService, { MessageType } from '../services/websocket';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PreferencesModal: React.FC<PreferencesModalProps> = ({ isOpen, onClose }) => {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userName, setUserName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'system'>('profile');
  const [isVisionEnabled, setIsVisionEnabled] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setSaveError(null);
      
      // Fetch current system prompt, user profile, and vision settings
      const handleSystemPrompt = (data: any) => {
        if (data && data.prompt) {
          setSystemPrompt(data.prompt);
        }
      };
      
      const handleUserProfile = (data: any) => {
        if (data && data.name !== undefined) {
          setUserName(data.name);
        }
      };
      
      const handleVisionSettings = (data: any) => {
        if (data && data.enabled !== undefined) {
          setIsVisionEnabled(data.enabled);
        }
      };
      
      // Listen for responses
      websocketService.addEventListener(MessageType.SYSTEM_PROMPT, handleSystemPrompt);
      websocketService.addEventListener(MessageType.USER_PROFILE, handleUserProfile);
      websocketService.addEventListener(MessageType.VISION_SETTINGS as any, handleVisionSettings);
      
      // Request data
      websocketService.getSystemPrompt();
      websocketService.getUserProfile();
      websocketService.getVisionSettings();
      
      console.log('Requested preferences data');
      
      return () => {
        websocketService.removeEventListener(MessageType.SYSTEM_PROMPT, handleSystemPrompt);
        websocketService.removeEventListener(MessageType.USER_PROFILE, handleUserProfile);
        websocketService.removeEventListener(MessageType.VISION_SETTINGS as any, handleVisionSettings);
      };
    }
  }, [isOpen]);
  
  // Listen for update confirmations
  useEffect(() => {
    let updateCount = 0;
    const expectedUpdateCount = 3; // Always expect 3 updates: system prompt, user profile, and vision
    let success = true;
    
    const handlePromptUpdated = (data: any) => {
      updateCount++;
      if (!(data && data.success)) {
        success = false;
        setSaveError('Failed to update system prompt. Please try again.');
      }
      
      if (updateCount >= expectedUpdateCount) {
        setIsSaving(false);
        if (success) {
          // Close modal only if all updates succeeded
          onClose();
        }
      }
    };
    
    const handleProfileUpdated = (data: any) => {
      updateCount++;
      if (!(data && data.success)) {
        success = false;
        setSaveError('Failed to update user profile. Please try again.');
      }
      
      if (updateCount >= expectedUpdateCount) {
        setIsSaving(false);
        if (success) {
          // Close modal only if all updates succeeded
          onClose();
        }
      }
    };
    
    const handleVisionSettingsUpdated = (data: any) => {
      updateCount++;
      if (!(data && data.success)) {
        success = false;
        setSaveError('Failed to update vision settings. Please try again.');
      }
      
      if (updateCount >= expectedUpdateCount) {
        setIsSaving(false);
        if (success) {
          // Close modal only if all updates succeeded
          onClose();
        }
      }
    };
    
    websocketService.addEventListener(MessageType.SYSTEM_PROMPT_UPDATED, handlePromptUpdated);
    websocketService.addEventListener(MessageType.USER_PROFILE_UPDATED, handleProfileUpdated);
    websocketService.addEventListener(MessageType.VISION_SETTINGS_UPDATED as any, handleVisionSettingsUpdated);
    
    return () => {
      websocketService.removeEventListener(MessageType.SYSTEM_PROMPT_UPDATED, handlePromptUpdated);
      websocketService.removeEventListener(MessageType.USER_PROFILE_UPDATED, handleProfileUpdated);
      websocketService.removeEventListener(MessageType.VISION_SETTINGS_UPDATED as any, handleVisionSettingsUpdated);
    };
  }, [onClose, activeTab]);
  
  const handleSave = () => {
    // Check if system prompt is empty when in system tab
    if (activeTab === 'system' && !systemPrompt.trim()) {
      setSaveError('System prompt cannot be empty');
      return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    
    // Always update all settings
    websocketService.updateSystemPrompt(systemPrompt);
    websocketService.updateUserProfile(userName);
    websocketService.updateVisionSettings(isVisionEnabled);
  };
  
  // backticks, in my code, in the year of our lord, 2025? no.
  const handleRestore = () => { 
    setSystemPrompt(
      "You are a helpful, friendly, and concise voice assistant. " +
      "Respond to user queries in a natural, conversational manner. " +
      "Keep responses brief and to the point, as you're communicating via voice. " +
      "When providing information, focus on the most relevant details. " +
      "If you don't know something, admit it rather than making up an answer." +
      "\n\n" +
      "Through the webapp, you can receive and understand photographs and pictures." +
      "\n\n" +
      "When the user sends a message like '[silent]', '[no response]', or '[still waiting]', it means they've gone quiet or haven't responded." +
      "When you see these signals, continue the conversation naturally based on the previous topic and context." +
      "Stay on topic, be helpful, and don't mention that they were silent - just carry on the conversation as if you're gently following up."
    );
  };
  
  // Tab rendering helpers
  // Vision tab disabled for now - reserved for future enhancement
  /*
  const renderVisionTab = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Vision</label>
        <div className="flex items-center">
          <div
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isVisionEnabled ? 'bg-emerald-600' : 'bg-slate-700'
            }`}
            onClick={() => setIsVisionEnabled(!isVisionEnabled)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isVisionEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </div>
          <span className="ml-3 text-sm text-slate-300">
            {isVisionEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          When enabled, Vocalis will use computer vision to analyze images and provide visual context to your conversations.
        </p>
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
          <p className="text-xs text-blue-300">
            <strong>Coming Soon:</strong> Vision capabilities will allow Vocalis to see and describe images,
            analyze documents, interpret charts, and provide visual assistance during your conversations.
          </p>
        </div>
      </div>
    </div>
  );
  */
  
  const renderProfileTab = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Your Name</label>
        <div className="relative">
          <input
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 p-3 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="Enter your name (optional)"
          />
          <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
        </div>
        <p className="text-xs text-slate-400">
          Your name will be used to personalize greetings and make the conversation feel more natural.
        </p>
      </div>
    </div>
  );
  
  const renderSystemTab = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">System Prompt</label>
        <button
          onClick={handleRestore}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          Restore Default
        </button>
      </div>
      <textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        className="w-full h-64 bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-slate-300 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
        placeholder="Enter system prompt..."
      />
      <p className="text-xs text-slate-400">
        The system prompt defines how the AI assistant behaves when responding to your voice commands.
      </p>
    </div>
  );
  
  // Handle animation state
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      setTimeout(() => setIsVisible(false), 300); // Match animation duration
    }
  }, [isOpen]);
  
  if (!isOpen && !isVisible) return null;
  
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100 bg-black/50' : 'opacity-0 pointer-events-none'}`}>
      <div className={`bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        {/* Header */}
        <div className="flex items-center p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Preferences</h2>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'profile'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
            onClick={() => setActiveTab('profile')}
          >
            <User className="w-4 h-4" />
            <span>User Profile</span>
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'system'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
            onClick={() => setActiveTab('system')}
          >
            <Sparkles className="w-4 h-4" />
            <span>System Prompt</span>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {activeTab === 'profile' 
            ? renderProfileTab() 
            : renderSystemTab()}
          
          {saveError && (
            <div className="text-red-400 text-sm p-2 bg-red-900/20 border border-red-900/30 rounded">
              {saveError}
            </div>
          )}
        </div>
        
        {/* Vision Settings Section */}
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-medium text-slate-300">Vision</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isVisionEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
                onClick={() => setIsVisionEnabled(!isVisionEnabled)}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isVisionEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </div>
              <span className="text-xs text-slate-400">
                {isVisionEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            When enabled, Vocalis can analyze images and provide visual context (coming soon).
          </p>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`
              px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg
              ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreferencesModal;
