import Link from 'next/link';

/**
 * Renders text with @mentions highlighted as clickable links to user profiles.
 * Also highlights #tags and special patterns like @username.
 * Falls back to rendering plain spans for safety.
 */
export function MentionText({ text, className = '' }: { text: string; className?: string }) {
  if (!text) return null;

  // Split on @username patterns (alphanumeric + underscore, min 2 chars after @)
  const parts = text.split(/(@\w{2,})/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith('@') && part.length > 2) {
          const username = part.slice(1);
          return (
            <Link
              key={i}
              href={`/profile/${username}`}
              onClick={(e) => e.stopPropagation()}
              className="text-green-400 hover:text-green-300 font-semibold underline underline-offset-2 decoration-green-500/30 hover:decoration-green-400/60 transition-all"
            >
              {part}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
