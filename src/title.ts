import { watchEffect } from 'vue'
import { plainText } from './minimessage'

export const SITE_TITLE = 'Chronos Quests'

/** Keeps the tab title on `<page> · Chronos Quests` (the page part may be MiniMessage). */
export function usePageTitle(page: () => string | null | undefined) {
  watchEffect(() => {
    const text = page()
    const plain = text ? plainText(text).replace(/\s+/g, ' ').trim() : ''
    document.title = plain ? `${plain} · ${SITE_TITLE}` : SITE_TITLE
  })
}
