import { useCallback, useEffect, useState } from 'react'

export type InterfaceLanguage = 'en' | 'lt'

const languageStorageKey = 'neurocrop-interface-language-v1'
const settingsStorageKey = 'neurocrop-dashboard-settings-v1'

const authTranslations: Record<string, string> = {
  'New account': 'Nauja paskyra',
  'Request your workspace.': 'Paprašykite darbo aplinkos.',
  'Create your user account first. NeuroCrop will approve the organization before sensor data is connected.': 'Pirmiausia sukurkite naudotojo paskyrą. „NeuroCrop“ patvirtins organizaciją prieš prijungiant sensorių duomenis.',
  'Create NeuroCrop access': 'Sukurti „NeuroCrop“ prieigą',
  'Enter your details and the organization name you want to manage.': 'Įveskite savo duomenis ir organizacijos, kurią norite valdyti, pavadinimą.',
  'Email address': 'El. pašto adresas',
  'Your name': 'Jūsų vardas',
  'Full name': 'Vardas ir pavardė',
  'Organization name': 'Organizacijos pavadinimas',
  'Farm or company name': 'Ūkio arba įmonės pavadinimas',
  'Password': 'Slaptažodis',
  'At least 12 characters': 'Bent 12 simbolių',
  'Creating account...': 'Kuriama paskyra...',
  'Create account': 'Sukurti paskyrą',
  'Back to sign in': 'Grįžti į prisijungimą',
  'Enter a valid email address.': 'Įveskite tinkamą el. pašto adresą.',
  'Enter your name.': 'Įveskite savo vardą.',
  'Enter an organization name.': 'Įveskite organizacijos pavadinimą.',
  'Use a password with at least 12 characters.': 'Naudokite bent 12 simbolių slaptažodį.',
  'Account created. NeuroCrop will review your workspace request.': 'Paskyra sukurta. „NeuroCrop“ peržiūrės jūsų darbo aplinkos prašymą.',
  'We could not create this account.': 'Šios paskyros sukurti nepavyko.',
  'Workspace invitation': 'Darbo aplinkos kvietimas',
  'Join your farm workspace.': 'Prisijunkite prie savo ūkio darbo aplinkos.',
  'Use a verified invitation to create your account or connect an existing NeuroCrop account.': 'Naudokite patvirtintą kvietimą paskyrai sukurti arba esamai „NeuroCrop“ paskyrai prijungti.',
  'Checking invitation': 'Tikrinamas kvietimas',
  'Confirming that this invitation is still active.': 'Tikrinama, ar šis kvietimas vis dar galioja.',
  'Invitation cancelled': 'Kvietimas atšauktas',
  'The organization administrator cancelled this invitation. Contact them if you still need access.': 'Organizacijos administratorius atšaukė šį kvietimą. Jei prieigos vis dar reikia, susisiekite su juo.',
  'Invitation expired': 'Kvietimo galiojimas baigėsi',
  'This invitation is no longer active. Ask the organization administrator to send a new one.': 'Šis kvietimas nebegalioja. Paprašykite organizacijos administratoriaus atsiųsti naują.',
  'Invitation already accepted': 'Kvietimas jau priimtas',
  'This link has already been used. Sign in with the account that accepted the invitation.': 'Ši nuoroda jau panaudota. Prisijunkite paskyra, kuri priėmė kvietimą.',
  'Organization unavailable': 'Organizacija nepasiekiama',
  'This organization can no longer accept new members.': 'Ši organizacija nebegali priimti naujų narių.',
  'Invalid invitation': 'Netinkamas kvietimas',
  'This invitation link is incomplete or not valid.': 'Ši kvietimo nuoroda yra neišsami arba netinkama.',
  'Invitation could not be checked': 'Kvietimo patikrinti nepavyko',
  'NeuroCrop could not reach the service. Check your connection and try again.': '„NeuroCrop“ nepavyko pasiekti paslaugos. Patikrinkite ryšį ir bandykite dar kartą.',
  'Invitation': 'Kvietimas',
  'Join': 'Prisijungti prie',
  'organization': 'organizacijos',
  'Your NeuroCrop password': 'Jūsų „NeuroCrop“ slaptažodis',
  'Create a password': 'Sukurti slaptažodį',
  'Enter your existing password': 'Įveskite esamą slaptažodį',
  'Setting up access...': 'Ruošiama prieiga...',
  'Accept invitation': 'Priimti kvietimą',
  'Organization:': 'Organizacija:',
  'Try again': 'Bandyti dar kartą',
  'We could not accept this invitation.': 'Šio kvietimo priimti nepavyko.',
  'Language': 'Kalba',
}

export function getInterfaceLanguage(): InterfaceLanguage {
  try {
    const stored = localStorage.getItem(languageStorageKey)
    if (stored === 'lt' || stored === 'en') return stored
    const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}') as { preferences?: { locale?: string } }
    return settings.preferences?.locale === 'lt-LT' ? 'lt' : 'en'
  } catch {
    return 'en'
  }
}

export function setInterfaceLanguage(language: InterfaceLanguage) {
  if (window.NeuroCropI18n) {
    window.NeuroCropI18n.setLanguage(language)
    return
  }
  try {
    localStorage.setItem(languageStorageKey, language)
    const settings = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}') as Record<string, unknown> & { preferences?: Record<string, unknown> }
    localStorage.setItem(settingsStorageKey, JSON.stringify({
      ...settings,
      preferences: { ...(settings.preferences || {}), locale: language === 'lt' ? 'lt-LT' : 'en-GB' },
    }))
  } catch {
    // The active page can still switch language if browser storage is unavailable.
  }
  document.documentElement.lang = language
  window.dispatchEvent(new CustomEvent('neurocrop:language-change', { detail: { language } }))
}

export function useInterfaceLanguage() {
  const [language, setLanguageState] = useState<InterfaceLanguage>(getInterfaceLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    const onLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<{ language?: InterfaceLanguage }>).detail?.language
      setLanguageState(next === 'lt' ? 'lt' : 'en')
    }
    window.addEventListener('neurocrop:language-change', onLanguageChange)
    return () => window.removeEventListener('neurocrop:language-change', onLanguageChange)
  }, [language])

  const setLanguage = useCallback((next: InterfaceLanguage) => {
    setLanguageState(next)
    setInterfaceLanguage(next)
  }, [])

  const t = useCallback((english: string) => language === 'lt' ? authTranslations[english] || english : english, [language])
  return { language, setLanguage, t }
}
