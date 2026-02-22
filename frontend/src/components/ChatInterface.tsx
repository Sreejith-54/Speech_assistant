import React, { useState, useEffect, useRef } from 'react';
import { Mic, Loader2, Volume2, VolumeX, PhoneOff, Phone, Eye } from 'lucide-react';
import BackgroundStars from './BackgroundStars';
import AssistantOrb from './AssistantOrb';
import JASigningPlayer from './JASigningPlayer';
import websocketService, { MessageType, ConnectionState } from '../services/websocket';
import audioService, { AudioEvent, AudioState } from '../services/audio';

// Assistant state type
type AssistantState = 'idle' | 'greeting' | 'listening' | 'processing' | 'speaking' | 'vision_file' | 'vision_processing' | 'vision_asr';

// AI mode
type AccessibilityMode = 'visually-challenged' | 'deaf';

interface ChatInterfaceProps {
  accessibilityMode: AccessibilityMode;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ accessibilityMode }) => {
  // State management
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [previousAssistantState, setPreviousAssistantState] = useState<AssistantState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [showConnectedStatus, setShowConnectedStatus] = useState(false);
  const [callActive, setCallActive] = useState(true);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Derived Assistant Mode
  const assistantMode = accessibilityMode === 'deaf' ? 'text' : 'voice';
  const [textInput, setTextInput] = useState(''); const [textChatHistory, setTextChatHistory] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
  const [assistantText, setAssistantText] = useState('');
  const [sigmlXml, setSigmlXml] = useState<string>('');
  const [isRecordingInTextMode, setIsRecordingInTextMode] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (assistantMode === 'text') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [textChatHistory, assistantMode]);

  // End call toast notification
  const [showEndCallToast, setShowEndCallToast] = useState(false);

  // Conversation behavior state
  const [isFirstInteraction, setIsFirstInteraction] = useState(true);
  const [followUpTier, setFollowUpTier] = useState(0);
  const [followUpTimer, setFollowUpTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [preventFollowUp, setPreventFollowUp] = useState(false); // Flag to prevent follow-ups after ending a call

  // Audio activity tracking - separate from full "listening" state
  // This detects even low-level audio that might block follow-ups but not trigger full listening
  const [potentialSpeechActivity, setPotentialSpeechActivity] = useState(false);
  const speechActivityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timeout to prevent getting stuck in listening state if Whisper doesn't process the audio
  const [listeningTimeout, setListeningTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Handle the vision button action
  const handleVisionAction = () => {
    // Prevent action if already in a protected state
    if (assistantState === 'processing' ||
      assistantState === 'vision_processing' ||
      assistantState === 'greeting') {
      console.log(`Cannot activate vision in ${assistantState} state`);
      return;
    }

    // Transition to vision file state
    setAssistantState('vision_file');

    console.log('Entering vision file state');
  };

  // Handle file selection for vision
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum size is 5MB.");
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result?.toString().split(',')[1] || '';

      // Move to processing state
      setAssistantState('vision_processing');

      // Send image to server
      websocketService.sendVisionImage(base64Data);
    };

    reader.readAsDataURL(file);
  };

  // Add timeout for vision_file state
  useEffect(() => {
    if (assistantState === 'vision_file') {
      // Start a 10-second timeout
      const timeout = setTimeout(() => {
        console.log('Vision file timeout expired, returning to idle');
        setAssistantState('idle');
      }, 10000); // 10 seconds

      return () => clearTimeout(timeout);
    }
  }, [assistantState]);

  // Listen for vision processing events
  useEffect(() => {
    // Handle vision processing updates
    const handleVisionProcessing = (data: any) => {
      if (data && data.status) {
        console.log(`Vision processing: ${data.status}`);
      }
    };

    // Handle vision context ready
    const handleVisionReady = () => {
      console.log("Vision context ready, switching back to idle");
      setAssistantState('idle');

      // We don't automatically trigger voice anymore to allow the user
      // to decide when they want to speak about the image
    };

    // Handle file upload result
    const handleVisionFileResult = (data: any) => {
      if (data && data.success) {
        console.log('Vision file upload successful');
      } else {
        console.log('Vision file upload failed');
        setError("Failed to upload image. Please try again.");
        setAssistantState('idle');
      }
    };

    // Add vision event listeners
    websocketService.addEventListener(MessageType.VISION_PROCESSING as any, handleVisionProcessing);
    websocketService.addEventListener(MessageType.VISION_READY as any, handleVisionReady);
    websocketService.addEventListener(MessageType.VISION_FILE_UPLOAD_RESULT as any, handleVisionFileResult);

    return () => {
      // Remove listeners
      websocketService.removeEventListener(MessageType.VISION_PROCESSING as any, handleVisionProcessing);
      websocketService.removeEventListener(MessageType.VISION_READY as any, handleVisionReady);
      websocketService.removeEventListener(MessageType.VISION_FILE_UPLOAD_RESULT as any, handleVisionFileResult);
    };
  }, []);

  // Handle ending a call
  const handleEndCall = () => {
    // Release all hardware access - completely stops the microphone
    // This is more aggressive than just stopRecording/stopPlayback
    audioService.releaseHardware();

    // Send interrupt to server if needed
    websocketService.interrupt();

    // Deactivate call - this is critical to stop voice processing
    setCallActive(false);

    // Clear conversation history on server
    websocketService.clearHistory();

    // Reset local state
    setTranscript('');
    setIsFirstInteraction(true);
    setFollowUpTier(0);

    // Clear any greeting flow protection
    websocketService.setGreetingFlowState(false);

    // Prevent any follow-ups after ending the call
    setPreventFollowUp(true);

    // Clear any existing follow-up timer
    if (followUpTimer) {
      clearTimeout(followUpTimer);
      setFollowUpTimer(null);
    }

    // Set to idle state
    setAssistantState('idle');

    // Show brief toast notification
    setShowEndCallToast(true);
    setTimeout(() => setShowEndCallToast(false), 3000);

    console.log('Call ended, conversation reset, microphone deactivated');
  };

  // Monitor connection state changes and handle transitions
  useEffect(() => {
    // If connection state changes to connected
    if (connectionState === ConnectionState.CONNECTED) {
      // Clear any errors
      if (error) {
        console.log('Connection established - clearing any WebSocket errors');
        setError(null);
      }

      // Show the connected status briefly
      setShowConnectedStatus(true);

      // Then hide it after a delay
      const timer = setTimeout(() => {
        setShowConnectedStatus(false);
      }, 2000); // Show for 2 seconds

      return () => clearTimeout(timer);
    }
  }, [connectionState, error]);

  // Initialize WebSocket and event listeners
  useEffect(() => {
    // Add a small delay before initial connection attempt
    // This helps avoid the initial connection error when the page loads
    const connectionTimer = setTimeout(() => {
      // Connect to WebSocket
      websocketService.connect();
    }, 500); // 500ms delay

    // Clean up timer if component unmounts before timeout completes
    return () => clearTimeout(connectionTimer);
  }, []); // Empty dependency array means this only runs once on mount

  // Handle microphone mute toggle
  const handleMuteToggle = () => {
    const newMuteState = audioService.toggleMicrophoneMute();
    setIsMuted(newMuteState);
    console.log(`Microphone ${newMuteState ? 'muted' : 'unmuted'}`);
  };

  // Listen for vision settings and updates
  useEffect(() => {
    const handleVisionSettings = (data: any) => {
      if (data && data.enabled !== undefined) {
        console.log(`Received vision settings: enabled=${data.enabled}`);
        setVisionEnabled(data.enabled);
      }
    };

    const handleVisionSettingsUpdated = (data: any) => {
      if (data && data.success) {
        // When successful update occurs, request the latest settings
        console.log('Vision settings updated, requesting latest settings');
        websocketService.getVisionSettings();
      }
    };

    const handleConnectionOpen = () => {
      console.log('WebSocket connected, requesting vision settings');
      websocketService.getVisionSettings();
    };

    // Add all event listeners
    websocketService.addEventListener(MessageType.VISION_SETTINGS as any, handleVisionSettings);
    websocketService.addEventListener(MessageType.VISION_SETTINGS_UPDATED as any, handleVisionSettingsUpdated);
    websocketService.addEventListener('open', handleConnectionOpen);

    // ALSO check if we're already connected, and if so, request settings immediately
    if (websocketService.getConnectionState() === ConnectionState.CONNECTED) {
      console.log('Already connected, requesting vision settings immediately');
      websocketService.getVisionSettings();
    }

    return () => {
      // Clean up all listeners
      websocketService.removeEventListener(MessageType.VISION_SETTINGS as any, handleVisionSettings);
      websocketService.removeEventListener(MessageType.VISION_SETTINGS_UPDATED as any, handleVisionSettingsUpdated);
      websocketService.removeEventListener('open', handleConnectionOpen);
    };
  }, []);

  // Set up event listeners (in a separate effect so the delay doesn't affect listeners)
  useEffect(() => {

    // Update connection state
    const handleConnectionChange = () => {
      const state = websocketService.getConnectionState();
      setConnectionState(state);
      setIsConnected(state === ConnectionState.CONNECTED);
    };

    // Handle raw audio data for early voice detection
    const handleAudioData = (data: any) => {
      // Two-tier threshold approach:

      // 1. LOWER threshold for "potential speech" - blocks follow-ups but doesn't show listening UI
      //    This catches background noise to prevent follow-up interruptions
      if (data.energy > 0.005) { // Very low threshold
        setPotentialSpeechActivity(true);

        // Reset timeout
        if (speechActivityTimeout.current) {
          clearTimeout(speechActivityTimeout.current);
        }

        // Auto-clear after short delay if it was just background noise
        speechActivityTimeout.current = setTimeout(() => {
          setPotentialSpeechActivity(false);
        }, 1500);

        console.log(`Audio energy detected: ${data.energy.toFixed(4)}, potential speech = true`);
      }

      // 2. HIGHER threshold for actual speech - shows listening UI
      //    This uses the VAD's more strict threshold (0.01)
      if (data.isVoice) {
        // Check if call is active - if not, ignore voice completely
        if (!callActive) {
          console.log(`Voice detected but call is not active, ignoring (energy: ${data.energy.toFixed(4)})`);
          return;
        }

        // Check if we're in processing, vision_processing, or greeting state - all should ignore voice
        if (assistantState === 'processing' || assistantState === 'vision_processing' || assistantState === 'greeting') {
          // Only log without changing state - effectively ignoring voice detection
          console.log(`Voice detected during ${assistantState} state (energy: ${data.energy.toFixed(4)}), ignoring`);
        }
        // For all other states (idle, speaking), use normal sensitivity
        else if (assistantState === 'idle' || assistantState === 'speaking') {
          console.log(`Voice detected (VAD), energy: ${data.energy.toFixed(4)}, changing state to listening`);
          setAssistantState('listening');
        }
        // Special handling for vision_asr state
        else if (assistantState === 'vision_asr') {
          console.log(`Voice detected during vision_asr state (energy: ${data.energy.toFixed(4)}), already in vision-aware listening`);
          // Stay in vision_asr state - it's already the correct visual state for vision context
          // No state change needed
        }
      }
    };

    // Add listener for raw audio data
    audioService.addEventListener(AudioEvent.RECORDING_DATA, handleAudioData);

    // Handle transcription results
    const handleTranscription = (data: any) => {
      setTranscript(data.text);

      if (!data.text.trim()) {
        console.log("Empty transcript received, returning to idle");
        setAssistantState('idle');
      } else {
        // In text mode with voice recording, populate the text input
        if (assistantMode === 'text' && isRecordingInTextMode) {
          setTextInput(data.text);
          setIsRecordingInTextMode(false);
          setAssistantState('idle');
        } else {
          // In voice mode, process as usual
          setAssistantState('processing');
        }
      }
    };

    // Handle LLM response
    const handleLLMResponse = (data: any) => {
      console.log('🎯 handleLLMResponse called:', {
        hasData: !!data,
        hasSigmlXml: !!data?.sigml_xml,
        sigmlLength: data?.sigml_xml?.length || 0,
        assistantMode,
        dataKeys: Object.keys(data || {})
      });
      
      // Add to text chat history based on mode
      if (assistantMode === 'text') {
        setTextChatHistory(prev => [...prev, { role: 'assistant', text: data.text }]);
      }
      setAssistantText(data.text || '');
      
      // Extract SiGML XML from response if available
      if (data.sigml_xml && typeof data.sigml_xml === 'string') {
        console.log('✅ Setting SiGML XML:', data.sigml_xml.substring(0, 100) + '...');
        setSigmlXml(data.sigml_xml);
      } else {
        console.log('❌ No SiGML XML in response');
        setSigmlXml('');
      }

      if (data.is_text_only) {
        setAssistantState('idle');
      } else {
        // If we're in greeting state, this is the greeting response
        if (assistantState === 'greeting') {
          console.log('Received LLM response during greeting state');
          // Note: We'll transition to speaking when audio playback actually starts
        }
      }
    };

    // Audio playback event handlers - we use these instead of TTS WebSocket events
    const handlePlaybackStart = () => {
      console.log('Playback started, setting UI to speaking state');
      // Always log source of playback to help debug follow-up issues
      console.log(`Source context: isFirstInteraction=${isFirstInteraction}, followUpTier=${followUpTier}, state=${assistantState}`);

      // Transition to speaking state regardless of whether we were in greeting, idle, or any other state
      setAssistantState('speaking');
    };

    const handlePlaybackEnd = () => {
      // Add a small debounce to ensure we're really done
      setTimeout(() => {
        // Double-check we're not still speaking when setting idle
        if (!audioService.isCurrentlySpeaking()) {
          console.log('Playback truly ended, setting UI to idle state');
          console.log(`Audio state before idle: ${audioService.getAudioState()}`);

          // End greeting flow protection once the initial greeting has finished playing
          if (previousAssistantState === 'speaking' && isFirstInteraction === false) {
            console.log('Initial greeting playback complete, ending greeting flow protection');
            websocketService.setGreetingFlowState(false);
          }

          setAssistantState('idle');
        } else {
          console.log('Playback end event received but still speaking');
        }
      }, 100);
    };

    // Handle WebSocket errors
    const handleError = (data: any) => {
      // Don't show WebSocket connection errors - we already have connection status indicators
      // Only show errors that aren't related to connection issues
      const errorMsg = data.error || 'Is the server running?';
      if (!errorMsg.includes('WebSocket') && !errorMsg.includes('connection')) {
        setError(errorMsg);
      }
      setAssistantState('idle');
    };

    // Set up WebSocket event listeners
    websocketService.addEventListener('open', handleConnectionChange);
    websocketService.addEventListener('close', handleConnectionChange);
    websocketService.addEventListener('error', handleConnectionChange);
    websocketService.addEventListener('transcription', handleTranscription);
    websocketService.addEventListener('llm_response', handleLLMResponse);
    // Add error handler for non-connection errors
    websocketService.addEventListener('error', handleError);

    // Set up audio service event listeners
    audioService.addEventListener(AudioEvent.RECORDING_START, () => {
      // Only change to listening state if we're not in a protected state
      if (assistantState !== 'processing' &&
        assistantState !== 'vision_processing' &&
        assistantState !== 'vision_asr') {
        setAssistantState('listening');
      } else {
        console.log(`Recording started during ${assistantState} state, maintaining state`);
      }
    });

    audioService.addEventListener(AudioEvent.RECORDING_STOP, () => {
      // Don't set state here, it will change based on server response
    });

    audioService.addEventListener(AudioEvent.PLAYBACK_START, handlePlaybackStart);
    audioService.addEventListener(AudioEvent.PLAYBACK_END, handlePlaybackEnd);

    audioService.addEventListener(AudioEvent.AUDIO_ERROR, (data) => {
      setError(`Audio error: ${data.error?.message || 'Unknown error'}`);
      setAssistantState('idle');
    });

    // Handle TTS lifecycle events
    const handleTtsChunk = (data: any) => {
      if (data.audio_chunk) {
        console.log(`Received TTS chunk (${data.audio_chunk.length} chars), scheduling for playback`);
        audioService.playAudioChunk(data.audio_chunk, data.format || 'mp3');
      }
    };

    websocketService.addEventListener('tts_chunk', handleTtsChunk);

    // Check connection state immediately
    handleConnectionChange();

    // Return cleanup function
    return () => {
      websocketService.removeEventListener('open', handleConnectionChange);
      websocketService.removeEventListener('close', handleConnectionChange);
      websocketService.removeEventListener('error', handleConnectionChange);
      websocketService.removeEventListener('transcription', handleTranscription);
      websocketService.removeEventListener('llm_response', handleLLMResponse);
      websocketService.removeEventListener('error', handleError);
      websocketService.removeEventListener('tts_chunk', handleTtsChunk);

      // Remove raw audio data listener
      audioService.removeEventListener(AudioEvent.RECORDING_DATA, handleAudioData);

      audioService.removeEventListener(AudioEvent.RECORDING_START, () => { });
      audioService.removeEventListener(AudioEvent.RECORDING_STOP, () => { });
      audioService.removeEventListener(AudioEvent.PLAYBACK_START, handlePlaybackStart);
      audioService.removeEventListener(AudioEvent.PLAYBACK_END, handlePlaybackEnd);
      audioService.removeEventListener(AudioEvent.AUDIO_ERROR, () => { });

      // Clean up speech activity timeout if it exists
      if (speechActivityTimeout.current) {
        clearTimeout(speechActivityTimeout.current);
      }

      // Disconnect WebSocket
      websocketService.disconnect();
    };
  }, []); // Keep empty dependency array to prevent WebSocket disconnection

  // Separate effect for TTS handlers that reacts to accessibilityMode changes
  useEffect(() => {
    const handleTtsStart = () => {
      console.log('TTS session started, initializing audio scheduler');
      audioService.handleTtsStart();

      // Note: Interruption handling is managed by audioService internally
    };

    const handleTtsEnd = () => {
      console.log('TTS session ended, finalizing playback');
      audioService.handleTtsEnd();

      // Note: Interruption state is managed by audioService
    };

    websocketService.addEventListener('tts_start', handleTtsStart);
    websocketService.addEventListener('tts_end', handleTtsEnd);

    return () => {
      websocketService.removeEventListener('tts_start', handleTtsStart);
      websocketService.removeEventListener('tts_end', handleTtsEnd);
    };
  }, [accessibilityMode]);

  // Track previous assistant state changes and sync with audio service
  useEffect(() => {
    setPreviousAssistantState(assistantState);

    // Inform audio service about all protected states
    audioService.setProcessingState(assistantState === 'processing');
    audioService.setGreetingState(assistantState === 'greeting');
    audioService.setVisionProcessingState(assistantState === 'vision_processing');

    // Cancel listening timeout when moving to processing, speaking, or greeting
    if (assistantState === 'processing' || assistantState === 'speaking' || assistantState === 'greeting') {
      if (listeningTimeout) {
        console.log(`State changed to ${assistantState} - clearing listening timeout`);
        clearTimeout(listeningTimeout);
        setListeningTimeout(null);
      }
    }

    // Add a timeout for the listening state to prevent getting stuck
    if (assistantState === 'listening') {
      // Clear any previous timeout
      if (listeningTimeout) {
        clearTimeout(listeningTimeout);
      }

      // Set a new timeout
      const timeout = setTimeout(() => {
        // Double-check current state before resetting to idle
        // We need to make sure we're still in listening and not in another active state
        // Get latest audio and system state before resetting
        const audioState = audioService.getAudioState();

        // Don't interrupt if audio is playing or if we've moved to another state
        if (audioState !== AudioState.PLAYING &&
          audioState !== AudioState.SPEAKING &&
          assistantState === 'listening') { // Double-check current state
          console.log('No processing detected, returning to idle');
          setAssistantState('idle');
        } else {
          console.log('Audio is playing/processing, not resetting state');
        }
      }, 5000); // 5 seconds is enough time for Whisper to start processing

      setListeningTimeout(timeout);
    }

    // Clean up timeout
    return () => {
      if (listeningTimeout) {
        clearTimeout(listeningTimeout);
      }
    };
  }, [assistantState]);

  // Handle silent follow-up timer
  useEffect(() => {
    // Clear any timer when the state changes to processing, speaking, or greeting
    if (assistantState === 'processing' || assistantState === 'speaking' || assistantState === 'greeting') {
      console.log(`State changed to ${assistantState} - clearing any follow-up timers`);
      if (followUpTimer) {
        clearTimeout(followUpTimer);
        setFollowUpTimer(null);
      }
    }

    // When call is reactivated, allow follow-ups again
    if (callActive && preventFollowUp) {
      setPreventFollowUp(false);
    }

    // Only start a timer when assistant becomes idle after speaking AND is not processing
    // AND when follow-ups are allowed (not immediately after ending a call)
    if (assistantState === 'idle' && previousAssistantState === 'speaking' && !preventFollowUp) {
      console.log('Assistant became idle after speaking - preparing follow-up timer');

      // Clear any existing timer
      if (followUpTimer) {
        clearTimeout(followUpTimer);
      }

      // Adjust delay based on tier for a more natural conversation cadence
      // Shorter delays for more responsive follow-ups
      const minDelay = 2000 + (followUpTier * 1000); // 2s -> 3s -> 4s
      const maxDelay = 2500 + (followUpTier * 1200); // 2.5s -> 3.7s -> 4.9s
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

      console.log(`Setting silent follow-up timer for ${randomDelay}ms (tier ${followUpTier + 1})`);

      // Create new timer
      const timer = setTimeout(() => {
        // When timer fires, check if we're still in a state where a follow-up makes sense
        // If we've moved to processing, speaking, or greeting in the meantime, we should abort
        if (preventFollowUp) {
          console.log(`Follow-up timer fired but state is now ${assistantState} - aborting follow-up`);
          return;
        }

        // Start a brief "listening window" to detect any just-started speech
        console.log(`Follow-up timer fired, starting pre-follow-up listening window (${followUpTier + 1})...`);

        // Create a listening window of 800ms
        // This gives time for any just-started speech to be detected before sending follow-up
        const listeningWindow = setTimeout(() => {
          // After listening window, check conditions again
          const audioState = audioService.getAudioState();

          // Multiple checks to ensure we should REALLY send a follow-up:
          // 1. We must be in idle state (not processing or speaking)
          // 2. No potential speech activity detected (lower threshold than full listening)
          // 3. We must be connected to the server
          // 4. Audio must be inactive (not recording or playing)
          // 5. Follow-ups must not be prevented by recent call end
          if (
            assistantState === 'idle' &&
            !potentialSpeechActivity &&  // No audio activity (even low-level background noise)
            isConnected &&
            audioState === AudioState.INACTIVE &&
            !preventFollowUp  // Make sure follow-ups are allowed
          ) {
            console.log(`No speech detected during listening window, sending follow-up (tier ${followUpTier + 1})`);
            console.log(`Final audio state check: ${audioState}`);
            websocketService.sendSilentFollowUp(followUpTier);

            // Increment tier for next time (cycle through 0-2)
            setFollowUpTier((prevTier) => (prevTier + 1) % 3);
          } else {
            console.log(`Conditions not met for follow-up, cancelling`);
            console.log(`State that prevented follow-up: assistantState=${assistantState}, audioState=${audioState}, preventFollowUp=${preventFollowUp}`);
          }
        }, 800); // 800ms listening window

        // Store the listening window timer reference for cleanup
        const currentListeningWindow = listeningWindow;

        // Update component cleanup to clear both timers
        return () => {
          clearTimeout(currentListeningWindow);
        };
      }, randomDelay);

      setFollowUpTimer(timer);
    }

    // If the user starts interacting (recording), clear timer and reset tier
    if (assistantState === 'listening') {
      // Reset tier counter when user speaks
      setFollowUpTier(0);

      // Clear any timer
      if (followUpTimer) {
        clearTimeout(followUpTimer);
        setFollowUpTimer(null);
      }
    }

    // Cleanup function
    return () => {
      if (followUpTimer) {
        clearTimeout(followUpTimer);
      }
    };
  }, [assistantState, previousAssistantState, followUpTier, isConnected, callActive, preventFollowUp]);

  // Handle the microphone/end call action
  const handleMicrophoneAction = async () => {
    // If we're not in the first interaction and not in processing state, allow end call
    if (!isFirstInteraction && assistantState !== 'processing') {
      // Handle ending the call
      handleEndCall();
    } else {
      // Otherwise, this is either:
      // 1. The first ever interaction, or
      // 2. A new interaction after ending a call (isFirstInteraction was reset), or
      // 3. A normal microphone action during a call
      try {
        if (audioService.getAudioState() === AudioState.RECORDING) {
          // Stop recording if already recording
          audioService.stopRecording();
        } else {
          // Prevent recording during processing or vision_processing states
          if (assistantState === 'processing' || assistantState === 'vision_processing') {
            console.log(`Cannot start recording during ${assistantState} state`);
            return;
          }

          // Check if assistant is currently speaking - if so, interrupt it
          if (assistantState === 'speaking') {
            console.log('Interrupting TTS playback due to new speech...');
            audioService.stopPlayback();
            websocketService.interrupt();
            setAssistantState('processing');
          }

          // Always re-enable call state when starting microphone in first interaction
          if (isFirstInteraction) {
            // Enable call state first (critical for voice detection to work)
            setCallActive(true);
            // Reset follow-up prevention flag when starting a new call
            setPreventFollowUp(false);
            console.log('Call activated - voice processing enabled');
          }

          // Start recording - this will reinitialize the audio context if needed
          console.log('Starting/restarting recording...');
          await audioService.startRecording();

          // Send greeting after activating mic if this is the first interaction
          if (isFirstInteraction && isConnected) {
            console.log('First interaction - sending greeting after mic activation');
            // Set state to greeting to show greeting UI and prevent interruptions
            setAssistantState('greeting');

            // This will automatically set greeting flow protection
            websocketService.sendGreeting();

            console.log('Activated greeting flow protection');
            setIsFirstInteraction(false);
          }
        }
      } catch (error) {
        console.error('Microphone error:', error);
        setError(`Microphone error: ${(error as Error).message}`);
      }
    }
  };

  // Handle text message submission
  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || !isConnected || assistantState === 'processing') return;

    // Add user message to history
    setTextChatHistory(prev => [...prev, { role: 'user', text: textInput }]);

    // Set processing state so UI shows it's working
    setAssistantState('processing');

    // Send to server
    websocketService.sendTextMessage(textInput);

    // Clear input
    setTextInput('');
  };

  // Handle voice recording in text mode
  const handleVoiceInputToggle = () => {
    if (!isConnected) return;

    if (isRecordingInTextMode) {
      // Stop recording
      audioService.stopRecording();
      setIsRecordingInTextMode(false);
    } else {
      // Start recording
      audioService.startRecording();
      setIsRecordingInTextMode(true);
      setAssistantState('listening');
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-radial from-[#1a1025] via-[#0d0a1f] to-[#06040f] text-slate-200 flex flex-col">
      {/* Custom animation styles */}
      <style>{`
        @keyframes colorCycle {
          0%, 100% { background-color: rgba(16, 185, 129, 0.1); border-color: rgba(52, 211, 153, 0.3); } /* Emerald */
          20% { background-color: rgba(59, 130, 246, 0.1); border-color: rgba(96, 165, 250, 0.3); } /* Blue */
          40% { background-color: rgba(139, 92, 246, 0.1); border-color: rgba(167, 139, 250, 0.3); } /* Purple */
          60% { background-color: rgba(245, 158, 11, 0.1); border-color: rgba(251, 191, 36, 0.3); } /* Amber */
          80% { background-color: rgba(239, 68, 68, 0.1); border-color: rgba(248, 113, 113, 0.3); } /* Red */
        }
        .animate-color-cycle {
          animation: colorCycle 8s infinite ease-in-out;
        }
      `}</style>
      <BackgroundStars />

      {/* Main chat container */}
      <div className="flex-1 flex items-center justify-center w-full px-4">
        {assistantMode === 'voice' ? (
          <>
            {/* Assistant orb */}
            <div className="flex flex-col items-center justify-center px-8">
              <div className={`
                transition-transform duration-500 ease-out
              `}>
                <AssistantOrb state={assistantState} />
              </div>

              {/* Status messages */}
              <div className="relative h-16 mt-4">
                {/* Greeting message */}
                <div className={`
              absolute inset-x-0 flex items-center justify-center
              transition-all duration-500
              ${assistantState === 'greeting' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
            `}>
                  <div className="flex items-center gap-2 bg-blue-900/30 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-400/20">
                    <Phone className="w-4 h-4 text-blue-400/70 animate-pulse" />
                    <span className="text-blue-400/70 text-sm">Greeting...</span>
                  </div>
                </div>

                {/* Processing message */}
                <div className={`
              absolute inset-x-0 flex items-center justify-center
              transition-all duration-500
              ${assistantState === 'processing' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
            `}>
                  <div className="flex items-center gap-2 bg-slate-900/50 backdrop-blur-sm px-4 py-2 rounded-full">
                    <Loader2 className="w-4 h-4 text-white/70 animate-spin" />
                    <span className="text-white/70 text-sm">Processing...</span>
                  </div>
                </div>

                {/* Speaking message */}
                <div className={`
              absolute inset-x-0 flex items-center justify-center
              transition-all duration-500
              ${assistantState === 'speaking' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
            `}>
                  <div className="flex items-center gap-2 bg-amber-900/30 backdrop-blur-sm px-4 py-2 rounded-full border border-amber-400/20">
                    <Volume2 className="w-4 h-4 text-amber-400/70 animate-pulse" />
                    <span className="text-amber-400/70 text-sm">Speaking...</span>
                  </div>
                </div>

                {/* Listening message */}
                <div className={`
              absolute inset-x-0 flex items-center justify-center
              transition-all duration-500
              ${assistantState === 'listening' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
            `}>
                  <div className="flex items-center gap-2 bg-emerald-900/30 backdrop-blur-sm px-4 py-2 rounded-full border border-emerald-400/20">
                    <Mic className="w-4 h-4 text-emerald-400/70 animate-pulse" />
                    <span className="text-emerald-400/70 text-sm">Listening...</span>
                  </div>
                </div>

                {/* Vision ASR message */}
                <div className={`
              absolute inset-x-0 flex items-center justify-center
              transition-all duration-500
              ${assistantState === 'vision_asr' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
            `}>
                  <div className="flex items-center gap-2 bg-emerald-900/30 backdrop-blur-sm px-4 py-2 rounded-full border border-emerald-400/20">
                    <Mic className="w-4 h-4 text-emerald-400/70 animate-pulse" />
                    <span className="text-emerald-400/70 text-sm">Ask...</span>
                  </div>
                </div>

                {/* Disconnected status */}
                <div className={`
              absolute inset-x-0 flex items-center justify-center bottom-0
              transition-all duration-500
              ${!isConnected ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
            `}>
                  <div className="flex items-center gap-2 bg-red-900/30 backdrop-blur-sm px-4 py-2 rounded-full border border-red-400/20">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                    <span className="text-red-400/70 text-xs">Disconnected</span>
                  </div>
                </div>

                {/* Connected status - shows briefly then fades away */}
                <div className={`
              absolute inset-x-0 flex items-center justify-center bottom-0
              transition-all duration-1000
              ${showConnectedStatus && isConnected ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
            `}>
                  <div className="flex items-center gap-2 bg-emerald-900/30 backdrop-blur-sm px-4 py-2 rounded-full border border-emerald-400/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span className="text-emerald-400/70 text-xs">Connected</span>
                  </div>
                </div>

                {/* End call toast - displays when conversation is reset */}
                <div className={`
              absolute inset-x-0 flex items-center justify-center top-0
              transition-all duration-500
              ${showEndCallToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6'}
            `}>
                  <div className="flex items-center gap-2 bg-red-900/30 backdrop-blur-sm px-4 py-2 rounded-full border border-red-400/20">
                    <PhoneOff className="w-4 h-4 text-red-400/70" />
                    <span className="text-red-300/90 text-sm">Goodbye!</span>
                  </div>
                </div>
              </div>

              {/* Transcription */}
              {transcript && (
                <div className="mt-4 max-w-md text-center text-slate-300/80 text-sm bg-slate-900/20 backdrop-blur-sm p-3 rounded-lg">
                  <p>{transcript}</p>
                </div>
              )}

              {assistantText && (
                <div id="assistant-text" className="mt-3 max-w-xl text-center text-slate-200 text-sm bg-slate-900/30 backdrop-blur-sm p-3 rounded-lg border border-slate-700/40">
                  <p>{assistantText}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Text Assistant Chat Interface */
          <div className={`flex flex-row h-[75vh] w-full ${assistantMode === 'text' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden mt-16 pb-4`}>
            {/* Main Chat Column */}
            <div className="flex-1 flex flex-col overflow-hidden pb-4">
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {textChatHistory.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-500">
                    <p>Type a message to start chatting with the Deaf (Text) Assistant...</p>
                  </div>
                ) : (
                  textChatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-6 py-4 shadow-sm ${msg.role === 'user'
                        ? 'bg-indigo-600/90 text-white rounded-br-sm'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/50 rounded-bl-sm'
                        }`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      </div>
                    </div>
                  ))
                )}
                {assistantState === 'processing' && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800/90 text-slate-400 border border-slate-700/50 rounded-2xl rounded-bl-sm px-6 py-4 flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Typing...</span>
                    </div>
                  </div>
                )}

                {assistantText && (
                  <div id="assistant-text" className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Assistant Text</p>
                    <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{assistantText}</p>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendText} className="p-4 mx-4 mt-2 bg-slate-800/60 rounded-full border border-slate-700/50 shadow-inner">
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type your message..."
                    className="w-full bg-transparent pl-6 pr-24 py-2 text-slate-200 focus:outline-none placeholder:text-slate-500"
                    disabled={!isConnected || assistantState === 'processing'}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleVoiceInputToggle}
                    disabled={!isConnected || assistantState === 'processing'}
                    className={`p-2.5 ${isRecordingInTextMode ? 'bg-red-600 hover:bg-red-500 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500'} disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full transition-colors flex items-center justify-center`}
                    title={isRecordingInTextMode ? 'Stop recording' : 'Record voice message'}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                  <button
                    type="submit"
                    disabled={!textInput.trim() || !isConnected || assistantState === 'processing'}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full transition-colors flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                  </button>
                </div>
              </form>
            </div>

            {/* Sign Language Panel Column */}
            {(() => {
              console.log('🔍 Render check:', { assistantMode, hasSigmlXml: !!sigmlXml, sigmlLength: sigmlXml?.length });
              return null;
            })()}
            {assistantMode === 'text' && sigmlXml && (
              <div className="w-80 shrink-0 h-full bg-slate-900/80 border-l border-slate-700/60 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden">
                <div className="bg-slate-800/80 px-4 py-4 flex items-center justify-center border-b border-slate-700/60 shadow-md">
                  <span className="font-bold text-slate-200 uppercase tracking-widest text-xs flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    ASL Sign Language (3D)
                  </span>
                </div>
                <div className="flex-1 p-4">
                  <JASigningPlayer
                    sigml={sigmlXml}
                    className="w-full h-full"
                    autoPlay={true}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audio input controls - only available in Voice mode */}
      {
        assistantMode === 'voice' && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3">
            {/* Audio visualizer would go here */}

            {/* Vision button - Only shown when enabled */}
            {visionEnabled && (
              <button
                onClick={handleVisionAction}
                className={`
              p-4 rounded-full transition-all duration-300
              ${assistantState === 'vision_file'
                    ? 'bg-sky-300/20 hover:bg-sky-300/30 border-sky-300/50' // Sky blue for vision file state
                    : assistantState === 'vision_asr'
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50' // Emerald for vision ASR
                      : assistantState === 'vision_processing'
                        ? 'bg-teal-500/20 hover:bg-teal-500/30 border-teal-400/50 cursor-not-allowed' // Teal for vision processing
                        : assistantState === 'listening'
                          ? 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400/50' // Purple-blue for listening
                          : assistantState === 'greeting'
                            ? 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400/50 cursor-not-allowed' // Purple-blue for greeting
                            : assistantState === 'processing'
                              ? 'bg-slate-900/50 border-purple-400/30 cursor-not-allowed' // Purple for processing (disabled)
                              : assistantState === 'speaking'
                                ? 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-400/30' // Purple-blue for speaking
                                : isFirstInteraction
                                  ? 'bg-indigo-900/20 border-indigo-400/10 cursor-not-allowed opacity-50' // Disabled state before call starts
                                  : 'bg-indigo-900/30 hover:bg-indigo-900/40 border-indigo-400/30' // Default for idle
                  }
              border-2 shadow-lg backdrop-blur-md transform transition-all duration-300
              hover:scale-105
            `}
                disabled={!isConnected || assistantState === 'processing' || assistantState === 'greeting' ||
                  assistantState === 'vision_processing' || isFirstInteraction}
              >
                <Eye className={`w-6 h-6 
              ${assistantState === 'vision_file'
                    ? 'text-sky-300' // Sky blue for vision file state
                    : assistantState === 'vision_asr'
                      ? 'text-emerald-400' // Emerald for vision ASR
                      : assistantState === 'vision_processing'
                        ? 'text-teal-400 animate-pulse' // Teal animate for vision processing
                        : assistantState === 'listening'
                          ? 'text-indigo-400' // indigo for listening
                          : assistantState === 'greeting'
                            ? 'text-indigo-400' // indigo for greeting
                            : assistantState === 'processing'
                              ? 'text-purple-400/70' // Purple for processing
                              : assistantState === 'speaking'
                                ? 'text-indigo-400' // indigo for speaking
                                : 'text-sky-300' // Default for idle - matching vision_file blue/cyan
                  }`}
                />
              </button>
            )}

            {/* Microphone button or End Call button */}
            <button
              onClick={handleMicrophoneAction}
              className={`
            p-4 rounded-full transition-all duration-300
            ${assistantState === 'listening'
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50' // Green for listening 
                  : assistantState === 'greeting'
                    ? 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-400/50 cursor-not-allowed' // Blue for greeting
                    : assistantState === 'processing'
                      ? 'bg-slate-900/50 border-purple-400/30 cursor-not-allowed' // Purple for processing (disabled)
                      : assistantState === 'speaking'
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-400/30' // Amber for speaking (enabled)
                        : !isFirstInteraction && assistantState === 'idle'
                          ? 'bg-red-500/10 hover:bg-red-500/20 border-red-400/30' // Red tint for end call
                          : 'bg-slate-900/30 hover:bg-slate-900/40 border-slate-400/30' // Default for idle
                }
            border-2 shadow-lg backdrop-blur-md transform transition-all duration-300
            ${isFirstInteraction && assistantState === 'idle'
                  ? 'animate-color-cycle hover:scale-110 hover:border-opacity-80' // Color cycling animation for first interaction with enhanced border on hover
                  : !isFirstInteraction && assistantState === 'idle'
                    ? 'hover:scale-110'
                    : 'hover:scale-105'
                }
          `}
              disabled={!isConnected || assistantState === 'processing' || assistantState === 'greeting'}
            >
              {/* Icon changes based on first interaction */}
              {isFirstInteraction ? (
                <Phone className={`w-6 h-6 
              ${assistantState === 'listening'
                    ? 'text-emerald-400' // Green icon for listening
                    : assistantState === 'greeting'
                      ? 'text-blue-400' // Blue icon for greeting
                      : assistantState === 'processing'
                        ? 'text-purple-400/70' // Purple icon for processing
                        : assistantState === 'speaking'
                          ? 'text-amber-400' // Amber icon for speaking
                          : 'text-slate-300' // Default for idle
                  }`}
                />
              ) : (
                <PhoneOff className={`w-6 h-6 
              ${assistantState === 'listening'
                    ? 'text-emerald-400' // Green icon for listening
                    : assistantState === 'greeting'
                      ? 'text-blue-400' // Blue icon for greeting
                      : assistantState === 'processing'
                        ? 'text-purple-400/70' // Purple icon for processing
                        : assistantState === 'speaking'
                          ? 'text-amber-400' // Amber icon for speaking
                          : 'text-red-400' // Red for idle after first interaction
                  }`}
                />
              )}
            </button>

            {/* Mute button */}
            <button
              onClick={handleMuteToggle}
              className={`
            p-4 rounded-full transition-all duration-300
            ${isFirstInteraction
                  ? 'bg-indigo-900/20 border-indigo-400/10 cursor-not-allowed opacity-50' // Disabled state before call starts
                  : isMuted
                    ? 'bg-red-500/20 hover:bg-red-500/30 border-red-400/50' // Red for muted
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50' // Green for unmuted
                }
            border-2 shadow-lg backdrop-blur-md transform transition-all duration-300
            ${!isFirstInteraction ? 'hover:scale-105' : ''}
          `}
              disabled={!isConnected || isFirstInteraction}
            >
              {isMuted ? (
                <VolumeX className={`w-6 h-6 ${isFirstInteraction ? 'text-indigo-400/50' : 'text-red-400'}`} />
              ) : (
                <Volume2 className={`w-6 h-6 ${isFirstInteraction ? 'text-indigo-400/50' : 'text-emerald-400'}`} />
              )}
            </button>
          </div>
        )
      }

      {/* Vision file upload positioned below orb */}
      {
        assistantState === 'vision_file' && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-full max-w-sm mx-auto z-30">
            <div className="bg-slate-900/95 shadow-xl border border-sky-300/20 p-6 rounded-xl backdrop-blur-md">
              <h3 className="text-lg font-medium text-sky-100 mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-sky-300" />
                <span>Select an image to analyse</span>
              </h3>

              <div
                className="border-2 border-dashed border-sky-300/30 rounded-lg p-6 text-center hover:border-sky-300/60 transition-colors cursor-pointer bg-slate-800/70"
                onClick={() => document.getElementById('vision-file-input')?.click()}
              >
                <p className="text-slate-300 mb-2">Click to browse or drag and drop</p>
                <p className="text-xs text-slate-400">Supports JPG, PNG, GIF up to 5MB</p>
              </div>

              <input
                id="vision-file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />

              <div className="flex justify-end mt-4 gap-3">
                <button
                  onClick={() => setAssistantState('idle')}
                  className="px-4 py-2 bg-sky-300/10 hover:bg-sky-300/20 text-sky-100 rounded-md border border-sky-300/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Vision processing message - positioned exactly like file upload */}
      {
        assistantState === 'vision_processing' && (
          <div className="absolute bottom-[175px] left-1/2 -translate-x-1/2 w-full max-w-sm mx-auto z-30">
            <div className="bg-slate-900/95 shadow-xl border border-sky-300/20 p-6 rounded-xl backdrop-blur-md text-center">
              <div className="flex justify-center mb-4">
                <Loader2 className="w-8 h-8 text-sky-300 animate-spin" />
              </div>
              <h3 className="text-lg font-medium text-sky-100 mb-2">
                Analysing image...
              </h3>
              <p className="text-sm text-slate-300">
                Processing your image with advanced AI vision capabilities
              </p>
            </div>
          </div>
        )
      }


      {/* Error toast */}
      {
        error && (
          <div className="fixed top-4 right-4 bg-red-900/60 text-white p-3 rounded-lg shadow-lg backdrop-blur-sm max-w-xs">
            <div className="flex items-center gap-2">
              <div className="text-red-300 font-medium">Error</div>
              <button
                className="ml-auto text-white/80 hover:text-white"
                onClick={() => setError(null)}
              >
                ×
              </button>
            </div>
            <p className="text-sm mt-1 text-red-100/90">{error}</p>
          </div>
        )
      }
    </div>
  );
};

export default ChatInterface;
