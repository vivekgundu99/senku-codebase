import { notesWindowMarkup } from './home';

/**
 * Legacy notesPanelMarkup redirected to the new filesystem-based Notes Window.
 */
export function notesPanelMarkup(): string {
  return notesWindowMarkup();
}
