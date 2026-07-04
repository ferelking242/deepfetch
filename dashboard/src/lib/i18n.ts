import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en'
import fr from '@/locales/fr'
import es from '@/locales/es'

const saved = localStorage.getItem('df-lang')
const browser = navigator.language.slice(0, 2)
const fallback = ['en', 'fr', 'es'].includes(browser) ? browser : 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
    },
    lng: saved ?? fallback,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

export default i18n
