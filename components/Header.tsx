
import React, { useEffect, useRef, useState } from 'react';
import { CreditIcon, NewProjectIcon, SaveIcon, FolderOpenIcon } from './Icons';

interface HeaderProps {
  credits: number;
  onReset: () => void;
  onSave: () => void;
  onLoad: () => void;
  canLoad: boolean;
}

const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(value);
  // The animation's own cursor. Holding it in a ref lets the effect depend on
  // `value` alone, so one timer runs per credit change; the previous version
  // listed displayValue as a dependency and so tore the interval down and
  // rebuilt it on every single tick.
  const displayRef = useRef(value);

  useEffect(() => {
    if (displayRef.current === value) return;

    const interval = setInterval(() => {
      displayRef.current += Math.sign(value - displayRef.current);
      setDisplayValue(displayRef.current);
      if (displayRef.current === value) clearInterval(interval);
    }, 50);

    return () => clearInterval(interval);
  }, [value]);

  // Derived rather than stored: the counter reads red exactly while it still
  // has ground to lose, which drops both the extra state and the timer that
  // used to reset it.
  const isDecreasing = displayValue > value;

  return (
    <span className={`font-mono font-bold text-lg transition-all duration-300 ${isDecreasing ? 'text-red-400 scale-110 inline-block' : 'text-cyan-300'}`}>
      {displayValue}
    </span>
  );
};

const Header: React.FC<HeaderProps> = ({ credits, onReset, onSave, onLoad, canLoad }) => {
  return (
    <header className="sticky top-4 z-50 px-4 md:px-8 mb-8">
      <div className="glass-panel rounded-2xl mx-auto py-3 px-6 flex justify-between items-center shadow-2xl shadow-black/20">
        <div className="flex items-center space-x-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                <div className="absolute inset-0 bg-white/20 rounded-xl blur-sm"></div>
                <svg xmlns="http://www.w3.org/2000/svg" className="relative h-6 w-6 text-white drop-shadow-md" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Influencer<span className="text-cyan-400">Labs</span>
              </h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em]">AI Video Studio</p>
            </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 bg-black/40 border border-white/5 px-4 py-2 rounded-xl">
            <div className="p-1 bg-yellow-500/20 rounded-full">
               <CreditIcon />
            </div>
            <div className="flex flex-col items-end leading-none">
                <AnimatedCounter value={credits} />
                <span className="text-[10px] text-gray-500 font-bold uppercase">Créditos</span>
            </div>
          </div>
          
          <div className="h-8 w-[1px] bg-white/10 mx-1"></div>

          <button
            onClick={onSave}
            className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700 text-gray-300 hover:text-white transition-all border border-white/5"
            title="Salvar Progresso"
          >
            <SaveIcon />
          </button>

          <button
            onClick={onLoad}
            disabled={!canLoad}
            className={`p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700 text-gray-300 hover:text-white transition-all border border-white/5 ${!canLoad ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Carregar Projeto Salvo"
          >
            <FolderOpenIcon />
          </button>

          <button
            onClick={onReset}
            className="group relative flex items-center justify-center w-10 h-10 md:w-auto md:px-5 md:py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white transition-all duration-200 shadow-lg hover:shadow-violet-500/30 active:scale-95 border border-white/10"
            title="Iniciar Novo Projeto"
          >
           <NewProjectIcon />
            <span className="hidden md:inline-block ml-2 font-medium text-sm">Novo Projeto</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
