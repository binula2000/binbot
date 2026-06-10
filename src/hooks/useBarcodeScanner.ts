import { useEffect, useRef, useState } from 'react';

interface UseBarcodeScannerProps {
  onScan: (barcode: string) => void;
  minCharacters?: number;
}

export function useBarcodeScanner({
  onScan,
  minCharacters = 3,
}: UseBarcodeScannerProps) {
  const [liveSequence, setLiveSequence] = useState<string>('');
  const buffer = useRef<string>('');
  const timeoutId = useRef<NodeJS.Timeout | null>(null);

  // Store the latest callback safely
  const savedOnScan = useRef(onScan);
  useEffect(() => {
    savedOnScan.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier combos
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Some scanners send Tab instead of Enter
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.current.length >= minCharacters) {
          e.preventDefault(); // Prevent accidental form submission
          savedOnScan.current(buffer.current);
        }
        buffer.current = '';
        setLiveSequence('');
        if (timeoutId.current) clearTimeout(timeoutId.current);
        return;
      }

      // Ignore modifiers and only capture single character keys
      if (e.key.length === 1) {
        buffer.current += e.key;
        setLiveSequence(buffer.current);
        
        // Clear the buffer if the user stops typing for 500ms (human typing vs scanner)
        // 500ms allows even slow configurations to work.
        // FALLBACK: If the 500ms goes by and we have enough characters, the scanner might 
        // be missing its 'Enter' suffix configuration. We auto-submit it for the user!
        if (timeoutId.current) clearTimeout(timeoutId.current);
        timeoutId.current = setTimeout(() => {
          if (buffer.current.length >= minCharacters) {
            savedOnScan.current(buffer.current);
          }
          buffer.current = '';
          setLiveSequence('');
        }, 500);
      }
    };

    // Use Capture phase (true) to intercept the Zebra scan BEFORE any inner input fields consume it!
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [minCharacters]);

  return { liveSequence };
}
