/**
 * ASL Sign Language Image Display
 * 
 * Displays static images of ASL hand signs
 */

import React, { useEffect, useState } from 'react';

interface JASigningPlayerProps {
  sigml: string | null;
  className?: string;
  autoPlay?: boolean;
}

interface Sign {
  gloss: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
}

export const JASigningPlayer: React.FC<JASigningPlayerProps> = ({
  sigml,
  className = '',
  autoPlay = true
}) => {
  const [signs, setSigns] = useState<Sign[]>([]);
  const [currentSignIndex, setCurrentSignIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageError, setImageError] = useState(false);

  // English helper words that are commonly omitted in ASL glossing
  const aslOmitWords = new Set([
    'are', 'is', 'am', 'was', 'were', 'be', 'been', 'being',
    'a', 'an', 'the'
  ]);

  // Get media URL for ASL sign using free resources
  const getSignMedia = (gloss: string): { mediaUrl: string; mediaType: 'image' | 'video' } => {
    const sign = gloss.toLowerCase();
    
    // Using ASL images from multiple free sources
    // Source 1: ASL Signbank (free educational resource)
    // Source 2: Lifeprint.com (Dr. Bill Vicars' free ASL resource)
    // Source 3: Handspeak.com (free ASL dictionary)
    
    const signMediaMaps: Record<string, { mediaUrl: string; mediaType: 'image' | 'video' }> = {
      // Common greetings
      'hello': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/hello.mp4', mediaType: 'video' },
      'hi': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/hi.mp4', mediaType: 'video' },
      'goodbye': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/goodbye.mp4', mediaType: 'video' },
      'bye': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/goodbye.mp4', mediaType: 'video' },
      'morning': { mediaUrl: 'https://ui-avatars.com/api/?name=MORNING&size=500&background=0f172a&color=10b981&bold=true&format=png', mediaType: 'image' },
      'night': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/night.mp4', mediaType: 'video' },
      
      // Politeness
      'please': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/please.mp4', mediaType: 'video' },
      'thank': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/thankyou.mp4', mediaType: 'video' },
      'airplane': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/airplane.mp4', mediaType: 'video' },
      'thanks': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/thankyou.mp4', mediaType: 'video' },
      'sorry': { mediaUrl: 'https://ui-avatars.com/api/?name=SORRY&size=500&background=0f172a&color=10b981&bold=true&format=png', mediaType: 'image' },
      'welcome': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/welcome.mp4', mediaType: 'video' },
      
      'birthday': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/birthday.mp4', mediaType: 'video' },
      'black': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/black.mp4', mediaType: 'video' },
      'body': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/body.mp4', mediaType: 'video' },
      // Common answers
      'yes': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/yes.mp4', mediaType: 'video' },
      'no': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/no.mp4', mediaType: 'video' },
      
      // Questions
      'who': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/who.mp4', mediaType: 'video' },
      'what': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/what.mp4', mediaType: 'video' },
      'where': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/where.mp4', mediaType: 'video' },
      'when': { mediaUrl: 'https://www.lifeprint.com/asl101/gifs/w/when.gif', mediaType: 'image' },
      'children': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/children.mp4', mediaType: 'video' },
      'color': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/color.mp4', mediaType: 'video' },
      'dance': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/dance.mp4', mediaType: 'video' },
      'why': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/why.mp4', mediaType: 'video' },
      'how': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/how.mp4', mediaType: 'video' },
      
      // Pronouns
      'door': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/door.mp4', mediaType: 'video' },
      'early': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/early.mp4', mediaType: 'video' },
      'easy': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/easy.mp4', mediaType: 'video' },
      'you': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/you.mp4', mediaType: 'video' },
      'engineer': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/engineer.mp4', mediaType: 'video' },
      'enjoy': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/enjoy.mp4', mediaType: 'video' },
      'few': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/few.mp4', mediaType: 'video' },
      'find': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/find.mp4', mediaType: 'video' },
      'me': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/me.mp4', mediaType: 'video' },
      'i': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/i.mp4', mediaType: 'video' },
      'first': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/first.mp4', mediaType: 'video' },
      
      // Common verbs
      'go': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/go.mp4', mediaType: 'video' },
      'hair': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/hair.mp4', mediaType: 'video' },
      'come': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/come.mp4', mediaType: 'video' },
      'help': { mediaUrl: 'https://www.lifeprint.com/asl101/gifs/h/help.gif', mediaType: 'image' },
      'understand': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/understand.mp4', mediaType: 'video' },
      'important': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/important.mp4', mediaType: 'video' },
      'know': { mediaUrl: 'https://www.lifeprint.com/asl101/gifs/k/know.gif', mediaType: 'image' },
      'join': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/join.mp4', mediaType: 'video' },
      'key': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/key.mp4', mediaType: 'video' },
      'kiss': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/kiss.mp4', mediaType: 'video' },
      'kitchen': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/kitchen.mp4', mediaType: 'video' },
      'last': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/last.mp4', mediaType: 'video' },
      'late': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/late.mp4', mediaType: 'video' },
      'want': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/want.mp4', mediaType: 'video' },
      'need': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/need.mp4', mediaType: 'video' },
      'light': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/light.mp4', mediaType: 'video' },

      'look': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/look.mp4', mediaType: 'video' },
      // Time words
      'lunch': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/lunch.mp4', mediaType: 'video' },
      'now': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/now.mp4', mediaType: 'video' },
      'today': { mediaUrl: 'https://ui-avatars.com/api/?name=TODAY&size=500&background=0f172a&color=10b981&bold=true&format=png', mediaType: 'image' },
      'tomorrow': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/tomorrow.mp4', mediaType: 'video' },
      'yesterday': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/yesterday.mp4', mediaType: 'video' },

      // Common nouns
      'water': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/water.mp4', mediaType: 'video' },
      'food': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/food.mp4', mediaType: 'video' },
      'home': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/home.mp4', mediaType: 'video' },
      
      // Common words
      'good': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/good.mp4', mediaType: 'video' },
      'bad': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/bad.mp4', mediaType: 'video' },
      'happy': { mediaUrl: 'https://ui-avatars.com/api/?name=HAPPY&size=500&background=0f172a&color=10b981&bold=true&format=png', mediaType: 'image' },
      'sad': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/sad.mp4', mediaType: 'video' },
      'are': { mediaUrl: 'https://ui-avatars.com/api/?name=ARE&size=500&background=0f172a&color=10b981&bold=true&format=png', mediaType: 'image' },
      'is': { mediaUrl: 'https://ui-avatars.com/api/?name=IS&size=500&background=0f172a&color=10b981&bold=true&format=png', mediaType: 'image' },
      'have': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/have.mp4', mediaType: 'video' },
      'can': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/can.mp4', mediaType: 'video' },
      'will': { mediaUrl: 'https://ui-avatars.com/api/?name=WILL&size=500&background=0f172a&color=10b981&bold=true&format=png', mediaType: 'image' },

      // Expanded verified MP4 vocabulary
      'again': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/again.mp4', mediaType: 'video' },
      'all': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/all.mp4', mediaType: 'video' },
      'apple': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/apple.mp4', mediaType: 'video' },
      'baby': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/baby.mp4', mediaType: 'video' },
      'bathroom': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/bathroom.mp4', mediaType: 'video' },
      'book': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/book.mp4', mediaType: 'video' },
      'boy': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/boy.mp4', mediaType: 'video' },
      'breakfast': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/breakfast.mp4', mediaType: 'video' },
      'brother': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/brother.mp4', mediaType: 'video' },
      'sister': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/sister.mp4', mediaType: 'video' },
      'child': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/child.mp4', mediaType: 'video' },
      'car': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/car.mp4', mediaType: 'video' },
      'cat': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/cat.mp4', mediaType: 'video' },
      'chair': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/chair.mp4', mediaType: 'video' },
      'deaf': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/deaf.mp4', mediaType: 'video' },
      'doctor': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/doctor.mp4', mediaType: 'video' },
      'dog': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/dog.mp4', mediaType: 'video' },
      'drink': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/drink.mp4', mediaType: 'video' },
      'eat': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/eat.mp4', mediaType: 'video' },
      'fine': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/fine.mp4', mediaType: 'video' },
      'finish': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/finish.mp4', mediaType: 'video' },
      'friend': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/friend.mp4', mediaType: 'video' },
      'girl': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/girl.mp4', mediaType: 'video' },
      'give': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/give.mp4', mediaType: 'video' },
      'hard': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/hard.mp4', mediaType: 'video' },
      'here': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/here.mp4', mediaType: 'video' },
      'hot': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/hot.mp4', mediaType: 'video' },
      'job': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/job.mp4', mediaType: 'video' },
      'juice': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/juice.mp4', mediaType: 'video' },
      'kid': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/kid.mp4', mediaType: 'video' },
      'learn': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/learn.mp4', mediaType: 'video' },
      'like': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/like.mp4', mediaType: 'video' },
      'love': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/love.mp4', mediaType: 'video' },
      'meet': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/meet.mp4', mediaType: 'video' },
      'milk': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/milk.mp4', mediaType: 'video' },
      'mom': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/mom.mp4', mediaType: 'video' },
      'more': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/more.mp4', mediaType: 'video' },
      'name': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/name.mp4', mediaType: 'video' },
      'new': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/new.mp4', mediaType: 'video' },
      'nice': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/nice.mp4', mediaType: 'video' },
      'paper': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/paper.mp4', mediaType: 'video' },
      'party': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/party.mp4', mediaType: 'video' },
      'phone': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/phone.mp4', mediaType: 'video' },
      'play': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/play.mp4', mediaType: 'video' },
      'practice': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/practice.mp4', mediaType: 'video' },
      'pretty': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/pretty.mp4', mediaType: 'video' },
      'right': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/right.mp4', mediaType: 'video' },
      'school': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/school.mp4', mediaType: 'video' },
      'see': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/see.mp4', mediaType: 'video' },
      'sit': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/sit.mp4', mediaType: 'video' },
      'sleep': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/sleep.mp4', mediaType: 'video' },
      'slow': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/slow.mp4', mediaType: 'video' },
      'stop': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/stop.mp4', mediaType: 'video' },
      'store': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/store.mp4', mediaType: 'video' },
      'table': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/table.mp4', mediaType: 'video' },
      'teacher': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/teacher.mp4', mediaType: 'video' },
      'thankyou': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/thankyou.mp4', mediaType: 'video' },
      'train': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/train.mp4', mediaType: 'video' },
      'travel': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/travel.mp4', mediaType: 'video' },
      'tree': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/tree.mp4', mediaType: 'video' },
      'up': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/up.mp4', mediaType: 'video' },
      'use': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/use.mp4', mediaType: 'video' },
      'walk': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/walk.mp4', mediaType: 'video' },
      'watch': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/watch.mp4', mediaType: 'video' },
      'with': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/with.mp4', mediaType: 'video' },
      'work': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/work.mp4', mediaType: 'video' },
      'year': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/year.mp4', mediaType: 'video' },
      'young': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/young.mp4', mediaType: 'video' },
      'your': { mediaUrl: 'https://www.lifeprint.com/asl101/videos/your.mp4', mediaType: 'video' },
    };
    
    // Return specific sign media or fallback to illustrated placeholder
    return signMediaMaps[sign] || {
      mediaUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(sign.toUpperCase())}&size=500&background=0f172a&color=10b981&bold=true&format=png`,
      mediaType: 'image'
    };
  };

  // Parse SiGML and extract signs
  useEffect(() => {
    if (!sigml) {
      setSigns([]);
      setCurrentSignIndex(0);
      return;
    }

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(sigml, 'text/xml');
      const signElements = xmlDoc.getElementsByTagName('hamgestural_sign');
      
      const extractedSigns: Sign[] = [];
      for (let i = 0; i < signElements.length; i++) {
        const gloss = signElements[i].getAttribute('gloss');
        if (gloss && gloss !== 'SEQUENCE') {
          const normalizedGloss = gloss.toLowerCase();
          if (aslOmitWords.has(normalizedGloss)) {
            continue;
          }

          const media = getSignMedia(gloss);
          extractedSigns.push({
            gloss,
            mediaUrl: media.mediaUrl,
            mediaType: media.mediaType
          });
        }
      }
      
      setSigns(extractedSigns);
      setCurrentSignIndex(0);
      setImageError(false);
      
      if (autoPlay && extractedSigns.length > 0) {
        setIsPlaying(true);
      }
      
      console.log('Loaded ASL sign images:', extractedSigns.map(s => s.gloss));
    } catch (error) {
      console.error('Error parsing SiGML:', error);
      setSigns([]);
    }
  }, [sigml, autoPlay]);

  // Auto-advance through signs
  useEffect(() => {
    if (!isPlaying || signs.length === 0) return;

    const interval = setInterval(() => {
      setCurrentSignIndex((prev) => {
        if (prev >= signs.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 2500); // Show each sign for 2.5 seconds

    return () => clearInterval(interval);
  }, [isPlaying, signs.length]);

  // Reset image error when sign changes
  useEffect(() => {
    setImageError(false);
  }, [currentSignIndex]);

  const handleRestart = () => {
    setCurrentSignIndex(0);
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleResume = () => {
    setIsPlaying(true);
  };

  const handleSignClick = (index: number) => {
    setCurrentSignIndex(index);
    setIsPlaying(false);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  if (!sigml || signs.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full bg-gradient-to-br from-slate-950 to-slate-900 rounded-xl ${className}`}>
        <div className="text-center text-slate-500 p-8">
          <div className="text-7xl mb-4">🤟</div>
          <p className="text-lg font-medium mb-2">ASL Sign Language</p>
          <p className="text-sm">Type a message to see hand signs</p>
        </div>
      </div>
    );
  }

  const currentSign = signs[currentSignIndex];
  const progress = ((currentSignIndex + 1) / signs.length) * 100;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Sign Image Display */}
      <div className="flex-1 rounded-xl overflow-hidden shadow-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center relative">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5"></div>
        
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-6">
          {/* Sign label above */}
          <div className="mb-4 bg-slate-800/80 backdrop-blur-sm px-8 py-3 rounded-2xl border border-emerald-500/30 shadow-xl">
            <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">
              Sign {currentSignIndex + 1} of {signs.length}
            </div>
            <div className="text-3xl font-bold text-white tracking-wide">
              {currentSign.gloss}
            </div>
          </div>

          {/* Hand sign media */}
          <div className="relative">
            {!imageError ? (
              currentSign.mediaType === 'video' ? (
                <video
                  src={currentSign.mediaUrl}
                  className="max-w-full max-h-[400px] rounded-xl shadow-2xl border-2 border-emerald-500/20"
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={handleImageError}
                />
              ) : (
                <img
                  src={currentSign.mediaUrl}
                  alt={`ASL sign for ${currentSign.gloss}`}
                  className="max-w-full max-h-[400px] rounded-xl shadow-2xl border-2 border-emerald-500/20"
                  onError={handleImageError}
                />
              )
            ) : (
              <div className="w-[400px] h-[500px] bg-slate-900 rounded-xl border-2 border-emerald-500/20 flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="text-8xl mb-4">🤟</div>
                  <div className="text-4xl font-bold text-emerald-400 mb-2">{currentSign.gloss}</div>
                  <p className="text-slate-500 text-sm">Hand sign placeholder</p>
                </div>
              </div>
            )}
          </div>

          {/* Helper text */}
          <div className="mt-4 text-slate-400 text-xs text-center">
            <p>👆 ASL sign media from free public sources (Lifeprint + fallback)</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 bg-slate-800/50 rounded-full h-2.5 overflow-hidden shadow-inner">
        <div 
          className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 transition-all duration-500 ease-out shadow-lg"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-center gap-3">
        {currentSignIndex > 0 && (
          <button
            onClick={() => {
              setCurrentSignIndex(Math.max(0, currentSignIndex - 1));
              setIsPlaying(false);
              setImageError(false);
            }}
            className="p-2.5 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors shadow-lg hover:shadow-emerald-500/20"
            title="Previous sign"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {isPlaying ? (
          <button
            onClick={handlePause}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-xl font-semibold text-white shadow-xl hover:shadow-emerald-500/30 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
            Pause
          </button>
        ) : currentSignIndex >= signs.length - 1 && !isPlaying ? (
          <button
            onClick={handleRestart}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 rounded-xl font-semibold text-white shadow-xl hover:shadow-purple-500/30 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            </svg>
            Restart
          </button>
        ) : (
          <button
            onClick={handleResume}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-xl font-semibold text-white shadow-xl hover:shadow-emerald-500/30 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
        )}

        {currentSignIndex < signs.length - 1 && (
          <button
            onClick={() => {
              setCurrentSignIndex(Math.min(signs.length - 1, currentSignIndex + 1));
              setIsPlaying(false);
              setImageError(false);
            }}
            className="p-2.5 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors shadow-lg hover:shadow-emerald-500/20"
            title="Next sign"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Sign List */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center max-h-24 overflow-y-auto custom-scrollbar">
        {signs.map((sign, index) => (
          <button
            key={index}
            onClick={() => handleSignClick(index)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all transform hover:scale-105 ${
              index === currentSignIndex
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-xl shadow-emerald-500/30'
                : index < currentSignIndex
                ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50'
                : 'bg-slate-700/30 text-slate-400 hover:bg-slate-600/40 border border-slate-600/30'
            }`}
          >
            {sign.gloss}
          </button>
        ))}
      </div>
    </div>
  );
};

export default JASigningPlayer;
