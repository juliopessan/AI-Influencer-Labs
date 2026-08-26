import React from 'react';
import { Script } from '../types';
import { UserIcon } from './Icons';

interface ScriptEditorProps {
  script: Script;
  characterDescription: string | null;
  onScriptChange: (index: number, field: 'scene' | 'narration', value: string) => void;
  isGeneratingVideo: boolean;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ script, characterDescription, onScriptChange, isGeneratingVideo }) => {
  return (
    <div className="glass-panel p-8 rounded-3xl animate-fade-in-up h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Editor de Roteiro</h2>
            <p className="text-xs text-gray-400 font-mono mt-1">PROJECT_ID: {script[0]?.id.split('-')[2] || 'UNKNOWN'}</p>
        </div>
        <div className="px-4 py-2 bg-cyan-500/10 rounded-lg border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <span className="text-xs text-cyan-400 uppercase font-bold tracking-widest">Modo Edição</span>
        </div>
      </div>
      
      {characterDescription && (
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-5 rounded-2xl border border-gray-700 mb-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <UserIcon />
          </div>
          <h3 className="flex items-center text-xs font-bold text-violet-400 mb-2 uppercase tracking-widest">
            <span className="w-2 h-2 bg-violet-500 rounded-full mr-2 animate-pulse"></span>
            Persona Ativa
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed font-light">{characterDescription}</p>
        </div>
      )}

      <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2 flex-grow">
        {script.map((chunk, index) => (
          <div key={chunk.id} className="group relative bg-black/20 p-6 rounded-2xl border border-white/5 hover:border-cyan-500/30 hover:bg-black/40 transition-all duration-300">
            <div className="absolute -left-3 top-6 w-6 h-6 bg-gray-800 border border-gray-600 rounded-full flex items-center justify-center text-xs font-bold text-gray-400 z-10 shadow-lg">
                {index + 1}
            </div>
            
            <div className="pl-4 space-y-5">
              <div>
                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                    <span className="w-1 h-4 bg-cyan-600 rounded-full mr-2"></span>
                    Descrição Visual
                </label>
                <textarea
                  value={chunk.scene}
                  onChange={(e) => onScriptChange(index, 'scene', e.target.value)}
                  className="w-full h-28 p-4 glass-input rounded-xl text-sm text-gray-200 leading-relaxed transition-all resize-none border-transparent focus:border-cyan-500/50"
                  disabled={isGeneratingVideo}
                />
              </div>
              <div>
                <label className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                    <span className="w-1 h-4 bg-violet-600 rounded-full mr-2"></span>
                    Narração (Voz)
                </label>
                <textarea
                  value={chunk.narration}
                  onChange={(e) => onScriptChange(index, 'narration', e.target.value)}
                  className="w-full h-24 p-4 glass-input rounded-xl text-sm text-gray-200 leading-relaxed transition-all resize-none border-transparent focus:border-violet-500/50 font-medium"
                  disabled={isGeneratingVideo}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScriptEditor;