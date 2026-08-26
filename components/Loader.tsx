import React from 'react';

export const Loader: React.FC = () => {
  return (
    <div className="relative w-5 h-5 flex items-center justify-center">
        <span className="absolute w-full h-full border-2 border-gray-700 rounded-full opacity-50"></span>
        <span className="absolute w-full h-full border-2 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></span>
        <span className="absolute w-3 h-3 bg-cyan-500 rounded-full opacity-20 animate-pulse"></span>
    </div>
  );
};