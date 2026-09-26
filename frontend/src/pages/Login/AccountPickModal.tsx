/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React from 'react';

type Candidate = {
  uid: string;
  username: string;
  nickname?: string | null;
};

const AccountPickModal: React.FC<{
  title: string;
  hint?: string;
  loading?: boolean;
  error?: string;
  backLabel: string;
  candidates: Candidate[];
  onSelect: (uid: string) => void;
  onBack: () => void;
}> = ({ title, hint, loading, error, backLabel, candidates, onSelect, onBack }) => {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5 text-left">
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
        {hint && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{hint}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {candidates.map((item) => (
          <button
            key={item.uid}
            type="button"
            disabled={loading}
            onClick={() => onSelect(item.uid)}
            className="w-full text-left rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              UID {item.uid}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {item.nickname || item.username}
              {item.nickname ? ` · ${item.username}` : ''}
            </div>
          </button>
        ))}
      </div>
      {error && (
        <p className="text-[12px] font-medium text-destructive text-center animate-shake">{error}</p>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={onBack}
        className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 w-full text-center transition-colors cursor-pointer disabled:opacity-50"
      >
        {backLabel}
      </button>
    </div>
  );
};

export default AccountPickModal;
