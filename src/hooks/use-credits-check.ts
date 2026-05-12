import { useInsufficientCreditsDialogStore } from '@/stores/insufficient-credits-dialog-store';
import { useCreditBalance } from './use-credits';

/**
 * Hook to check if user has enough credits and show dialog if not
 *
 * Usage:
 * ```tsx
 * const { checkCredits, userCredits, isLoading } = useCreditsCheck();
 *
 * const handleGenerate = () => {
 *   if (!checkCredits(requiredCredits)) return;
 *   // Continue with generation...
 * };
 * ```
 */
export function useCreditsCheck() {
  const { openDialog } = useInsufficientCreditsDialogStore();
  const { data: userCredits = 0, isLoading } = useCreditBalance();

  /**
   * Check if user has enough credits
   * @param requiredCredits - The number of credits required for the operation
   * @returns true if user has enough credits, false otherwise (and opens dialog)
   */
  const checkCredits = (requiredCredits: number): boolean => {
    if (userCredits < requiredCredits) {
      openDialog({
        currentCredits: userCredits,
        requiredCredits,
      });
      return false;
    }
    return true;
  };

  return {
    checkCredits,
    userCredits,
    isLoading,
  };
}
